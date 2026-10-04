const mongoose = require('mongoose');
const Order = require('../models/Order');
const {
  reserveOrderStock,
  releaseOrderStockReservation,
  validateOrderReservation
} = require('../services/inventory');
const {
  createRazorpayOrder: createProviderOrder,
  getExistingRazorpayOrder,
  verifyRazorpaySignature
} = require('../services/razorpay');
const { cancelCustomerOrder, cancellableStatuses } = require('../services/orderCancellation');

function renderNotFound(res) {
  return res.status(404).render('404', { title: 'Order not found | Maison Atelier' });
}

async function createRazorpayOrder(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Order not found.' });

  let order;
  let reservationCreated = false;
  let hadRazorpayOrder = false;
  try {
    order = await Order.findOne({ _id: req.params.id, user: req.session.userId });
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (order.paymentStatus === 'paid') return res.status(409).json({ error: 'This order has already been paid.' });
    if ((order.paymentMethod || 'online') !== 'online'
      || !['pending', 'failed'].includes(order.paymentStatus)
      || order.orderStatus === 'cancelled') {
      return res.status(409).json({ error: 'This order is not available for payment.' });
    }

    hadRazorpayOrder = Boolean(order.razorpayOrderId);
    reservationCreated = await reserveOrderStock(order);
    const paymentOrder = order.razorpayOrderId
      ? getExistingRazorpayOrder(order)
      : await createProviderOrder(order);
    const razorpayOrderId = paymentOrder.razorpayOrderId || paymentOrder.razorpayOrder.id;
    const updatedOrder = await Order.findOneAndUpdate(
      {
        _id: order._id,
        user: req.session.userId,
        paymentStatus: { $in: ['pending', 'failed'] },
        inventoryReservationStatus: 'reserved',
        orderStatus: { $ne: 'cancelled' }
      },
      { $set: { razorpayOrderId, paymentStatus: 'pending' } },
      { new: true, runValidators: true }
    );
    if (!updatedOrder) {
      const error = new Error('This order is no longer available for payment.');
      error.code = 'STOCK_RESERVATION_UNAVAILABLE';
      throw error;
    }

    res.json({
      keyId: paymentOrder.keyId,
      amount: paymentOrder.amount,
      currency: paymentOrder.currency,
      razorpayOrderId,
      name: 'Maison Atelier',
      description: `Order #${String(order._id).slice(-8).toUpperCase()}`,
      contactEmail: order.contactEmail
    });
  } catch (error) {
    if (reservationCreated && !hadRazorpayOrder && order) {
      try {
        await releaseOrderStockReservation(order);
      } catch (releaseError) {
        return next(new AggregateError([error, releaseError], 'Razorpay order creation failed and inventory reservation rollback was incomplete.'));
      }
    }
    if (error.code === 'PAYMENT_NOT_CONFIGURED') {
      return res.status(503).json({ error: 'Razorpay Test Mode is not configured. Add the test credentials to the server environment.' });
    }
    if (error.code === 'INSUFFICIENT_STOCK') {
      return res.status(409).json({ error: 'Some items are no longer available in the requested quantities. Your order has not entered payment; please contact us to update it.' });
    }
    if (error.code === 'STOCK_RESERVATION_UNAVAILABLE') {
      return res.status(409).json({ error: 'This order could not reserve inventory. Refresh the order and try again.' });
    }
    next(error);
  }
}

async function verifyRazorpayPayment(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Order not found.' });
  const { razorpay_payment_id: paymentId, razorpay_order_id: razorpayOrderId, razorpay_signature: signature } = req.body;
  if (![paymentId, razorpayOrderId, signature].every((value) => typeof value === 'string' && value.length > 0)) {
    return res.status(422).json({ error: 'Razorpay payment verification details are incomplete.' });
  }

  try {
    const order = await Order.findOne({ _id: req.params.id, user: req.session.userId });
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (order.paymentStatus === 'paid') {
      if (order.razorpayOrderId === razorpayOrderId && order.razorpayPaymentId === paymentId) {
        return res.json({ success: true, redirectUrl: `/order-confirmation/${order._id}?payment=success` });
      }
      return res.status(409).json({ error: 'This order has already been paid.' });
    }
    if ((order.paymentMethod || 'online') !== 'online' || !['pending', 'failed'].includes(order.paymentStatus) || order.razorpayOrderId !== razorpayOrderId) {
      return res.status(409).json({ error: 'The Razorpay order does not match this order.' });
    }
    if (!verifyRazorpaySignature({ orderId: razorpayOrderId, paymentId, signature })) {
      return res.status(400).json({ error: 'Razorpay payment verification failed. Your order has not been marked paid.' });
    }

    if (order.inventoryReservationStatus === 'reserved') {
      await validateOrderReservation(order.items);
    } else {
      await reserveOrderStock(order);
    }
    const paidOrder = await Order.findOneAndUpdate(
      {
        _id: order._id,
        user: req.session.userId,
        razorpayOrderId,
        paymentStatus: { $in: ['pending', 'failed'] },
        inventoryReservationStatus: 'reserved',
        orderStatus: { $ne: 'cancelled' }
      },
      {
        $set: {
          paymentStatus: 'paid',
          razorpayPaymentId: paymentId,
          orderStatus: 'confirmed',
          inventoryReservationStatus: 'consumed'
        }
      },
      { new: true, runValidators: true }
    );
    if (!paidOrder) {
      const currentOrder = await Order.findOne({ _id: order._id, user: req.session.userId }).lean();
      if (currentOrder?.paymentStatus === 'paid'
        && currentOrder.razorpayOrderId === razorpayOrderId
        && currentOrder.razorpayPaymentId === paymentId) {
        return res.json({ success: true, redirectUrl: `/order-confirmation/${order._id}?payment=success` });
      }
      return res.status(409).json({ error: 'The order payment status changed. Refresh the order before retrying.' });
    }
    res.json({ success: true, redirectUrl: `/order-confirmation/${paidOrder._id}?payment=success` });
  } catch (error) {
    if (error.code === 'PAYMENT_NOT_CONFIGURED') {
      return res.status(503).json({ error: 'Razorpay Test Mode is not configured on the server.' });
    }
    if (['INSUFFICIENT_STOCK', 'INVALID_STOCK_RESERVATION'].includes(error.code)) {
      try {
        const paidOrder = await Order.findOneAndUpdate(
          {
            _id: req.params.id,
            user: req.session.userId,
            razorpayOrderId,
            paymentStatus: { $in: ['pending', 'failed'] },
            inventoryReservationStatus: { $in: ['none', 'reserved', null] },
            orderStatus: { $ne: 'cancelled' }
          },
          {
            $set: {
              paymentStatus: 'paid',
              razorpayPaymentId: paymentId,
              orderStatus: 'cancelled',
              inventoryReservationStatus: 'none'
            }
          },
          { new: true, runValidators: true }
        );
        if (paidOrder) {
          return res.json({
            success: true,
            redirectUrl: `/order-confirmation/${paidOrder._id}?payment=inventory-issue`
          });
        }
        const currentOrder = await Order.findOne({ _id: req.params.id, user: req.session.userId }).lean();
        if (currentOrder?.paymentStatus === 'paid'
          && currentOrder.razorpayOrderId === razorpayOrderId
          && currentOrder.razorpayPaymentId === paymentId) {
          return res.json({ success: true, redirectUrl: `/order-confirmation/${currentOrder._id}?payment=inventory-issue` });
        }
        return res.status(409).json({ error: 'Payment was verified, but the order changed. Please contact us for assistance.' });
      } catch (updateError) {
        return next(new AggregateError([error, updateError], 'Payment was verified but could not be saved after an inventory conflict.'));
      }
    }
    next(error);
  }
}

async function markRazorpayPaymentFailed(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Order not found.' });
  try {
    const order = await Order.findOneAndUpdate(
      { _id: req.params.id, user: req.session.userId, paymentMethod: { $in: ['online', null] }, paymentStatus: 'pending' },
      { $set: { paymentStatus: 'failed' } },
      { new: true, runValidators: true }
    );
    if (!order) {
      const currentOrder = await Order.findOne({ _id: req.params.id, user: req.session.userId }).select('paymentStatus');
      if (!currentOrder) return res.status(404).json({ error: 'Order not found.' });
    }
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

async function renderOrderHistory(req, res, next) {
  try {
    const orders = await Order.find({ user: req.session.userId }).sort({ createdAt: -1 }).lean();
    res.render('orders', {
      title: 'Order history | Maison Atelier',
      orders,
      formatPrice: (amount) => Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    });
  } catch (error) {
    next(error);
  }
}

async function renderOrderDetail(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.id)) return renderNotFound(res);

  try {
    const order = await Order.findOne({ _id: req.params.id, user: req.session.userId }).lean();
    if (!order) return renderNotFound(res);
    res.render('order-detail', {
      title: `Order ${String(order._id).slice(-8).toUpperCase()} | Maison Atelier`,
      order,
      confirmation: false,
      isAdminView: false,
      paymentMessage: req.query.cancelled === '1'
        ? order.paymentStatus === 'paid' && (order.paymentMethod || 'online') === 'online'
          ? 'Your order has been cancelled. Refund handling is pending and will be managed manually; no refund has been processed yet.'
          : order.paymentMethod === 'cod'
            ? 'Your Cash on Delivery order has been cancelled. No refund is due.'
            : 'Your order has been cancelled.'
        : null,
      cancellationError: req.query.cancelError || '',
      canCancel: cancellableStatuses.includes(order.orderStatus)
        && !((order.paymentMethod || 'online') === 'online' && order.paymentStatus === 'pending' && order.razorpayOrderId),
      formatPrice: (amount) => Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    });
  } catch (error) {
    next(error);
  }
}

async function cancelOrder(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.id)) return renderNotFound(res);
  try {
    const order = await cancelCustomerOrder(req.params.id, req.session.userId);
    if (!order) {
      const current = await Order.findOne({ _id: req.params.id, user: req.session.userId })
        .select('orderStatus paymentMethod paymentStatus razorpayOrderId inventoryReservationStatus');
      if (!current) return renderNotFound(res);
      return res.redirect(`/orders/${current._id}?cancelError=${encodeURIComponent(
        (current.paymentMethod || 'online') === 'online' && current.paymentStatus === 'pending' && current.razorpayOrderId
          ? 'An online payment is in progress. Wait for its result before cancelling this order.'
          : cancellableStatuses.includes(current.orderStatus)
            ? 'This order is already being updated. Please refresh and try again.'
            : 'This order can no longer be cancelled.'
      )}`);
    }
    res.redirect(`/orders/${order._id}?cancelled=1`);
  } catch (error) {
    next(error);
  }
}

module.exports = { renderOrderHistory, renderOrderDetail, createRazorpayOrder, verifyRazorpayPayment, markRazorpayPaymentFailed, cancelOrder };
