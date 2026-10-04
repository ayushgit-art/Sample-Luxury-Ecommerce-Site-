const mongoose = require('mongoose');
const CartItem = require('../models/CartItem');
const Order = require('../models/Order');
const { validateOrderStock, deductOrderStock, restoreStock } = require('../services/inventory');

const SHIPPING_THRESHOLD = 500;
const SHIPPING_COST = 12;
const TAX_RATE = 0.2;

class CheckoutIssue extends Error {}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function unitPrice(product) {
  return product.discountPrice == null ? product.price : product.discountPrice;
}

function validOption(value, choices) {
  return choices.length ? choices.includes(value) : value === '';
}

function checkoutValues(body, req) {
  return {
    contactName: String(body.contactName || '').trim(),
    contactEmail: String(body.contactEmail || '').trim().toLowerCase(),
    addressLine1: String(body.addressLine1 || '').trim(),
    addressLine2: String(body.addressLine2 || '').trim(),
    city: String(body.city || '').trim(),
    region: String(body.region || '').trim(),
    postalCode: String(body.postalCode || '').trim(),
    country: String(body.country || '').trim(),
    phone: String(body.phone || '').trim(),
    paymentMethod: String(body.paymentMethod || 'online'),
    defaults: {
      contactName: req.session.userName || '',
      contactEmail: req.session.userEmail || ''
    }
  };
}

async function getCheckoutData(userId) {
  const rows = await CartItem.find({ user: userId }).populate('product').lean();
  if (!rows.length) return { cartItems: [], quantity: 0, subtotal: 0, shippingCost: 0, tax: 0, total: 0, error: null };

  let subtotal = 0;
  let quantity = 0;
  let error = null;
  const cartItems = rows.filter((item) => item.product);
  for (const item of rows) {
    const product = item.product;
    if (!product) {
      error ||= 'A product in your bag is no longer available. Remove it before continuing.';
      continue;
    }
    if (!validOption(item.size, product.sizes || []) || !validOption(item.color, product.colors || [])) {
      error ||= `${product.name} has an unavailable option. Remove it from your bag and select it again.`;
    }
    if (item.quantity > product.stock) {
      error ||= `Only ${product.stock} of ${product.name} remain in stock.`;
    }
    subtotal += unitPrice(product) * item.quantity;
    quantity += item.quantity;
  }

  subtotal = roundMoney(subtotal);
  const shippingCost = subtotal >= SHIPPING_THRESHOLD ? 0 : SHIPPING_COST;
  const tax = roundMoney(subtotal * TAX_RATE);
  return {
    cartItems,
    quantity,
    subtotal,
    shippingCost,
    tax,
    total: roundMoney(subtotal + shippingCost + tax),
    error
  };
}

function renderCheckout(res, data, values, error, status = 200) {
  return res.status(status).render('checkout', {
    title: 'Checkout | Maison Atelier',
    ...data,
    values,
    error,
    formatPrice: (amount) => Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  });
}

async function showCheckout(req, res, next) {
  try {
    const data = await getCheckoutData(req.session.userId);
    if (!data.cartItems.length) return res.redirect('/cart');
    renderCheckout(res, data, checkoutValues({}, req), data.error, data.error ? 409 : 200);
  } catch (error) {
    next(error);
  }
}

async function submitCheckout(req, res, next) {
  const values = checkoutValues(req.body, req);
  let data;
  let order;
  let stockDeductions = [];

  try {
    data = await getCheckoutData(req.session.userId);
    if (!data.cartItems.length) return res.redirect('/cart');
    if (data.error) throw new CheckoutIssue(data.error);

    if (values.contactName.length < 2 || values.contactName.length > 80) {
      throw new CheckoutIssue('Enter a contact name between 2 and 80 characters.');
    }
    if (values.contactEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.contactEmail)) {
      throw new CheckoutIssue('Enter a valid contact email address.');
    }
    if (!values.addressLine1 || !values.city || !values.postalCode || !values.country) {
      throw new CheckoutIssue('Complete the required shipping address fields.');
    }
    if (!['online', 'cod'].includes(values.paymentMethod)) throw new CheckoutIssue('Select a valid payment method.');

    const orderItems = data.cartItems.map((item) => {
      const product = item.product;
      return {
        product: product._id,
        name: product.name,
        slug: product.slug,
        category: product.category,
        image: product.images[0] || '',
        quantity: item.quantity,
        unitPrice: unitPrice(product),
        size: item.size,
        color: item.color
      };
    });

    await validateOrderStock(orderItems);
    if (values.paymentMethod === 'cod') stockDeductions = await deductOrderStock(orderItems);

    order = await Order.create({
      user: new mongoose.Types.ObjectId(req.session.userId),
      contactEmail: values.contactEmail,
      items: orderItems,
      shippingAddress: {
        recipientName: values.contactName,
        addressLine1: values.addressLine1,
        addressLine2: values.addressLine2,
        city: values.city,
        region: values.region,
        postalCode: values.postalCode,
        country: values.country,
        phone: values.phone
      },
      subtotal: data.subtotal,
      shippingCost: data.shippingCost,
      tax: data.tax,
      total: data.total,
      paymentMethod: values.paymentMethod,
      paymentStatus: 'pending',
      inventoryReservationStatus: values.paymentMethod === 'cod' ? 'consumed' : 'none',
      orderStatus: values.paymentMethod === 'cod' ? 'confirmed' : 'pending'
    });

    await CartItem.deleteMany({ user: req.session.userId });
    return res.redirect(`/order-confirmation/${order._id}`);
  } catch (error) {
    try {
      if (order) await Order.deleteOne({ _id: order._id });
      if (stockDeductions.length) await restoreStock(stockDeductions);
    } catch (rollbackError) {
      return next(new AggregateError([error, rollbackError], 'Checkout failed and order rollback was incomplete.'));
    }

    if (error instanceof CheckoutIssue || error.code === 'INSUFFICIENT_STOCK') {
      try {
        data = await getCheckoutData(req.session.userId);
      } catch (_cartError) {
        data = { cartItems: [], quantity: 0, subtotal: 0, shippingCost: 0, tax: 0, total: 0, error: null };
      }
      return renderCheckout(res, data, values, error.message, 422);
    }
    next(error);
  }
}

async function showOrderConfirmation(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).render('404', { title: 'Order not found | Maison Atelier' });
  }

  try {
    const order = await Order.findOne({ _id: req.params.id, user: req.session.userId }).lean();
    if (!order) return res.status(404).render('404', { title: 'Order not found | Maison Atelier' });
    res.render('order-detail', {
      title: `Order received | Maison Atelier`,
      order,
      confirmation: true,
      isAdminView: false,
      cancellationError: '',
      canCancel: false,
      paymentMessage: order.orderStatus === 'cancelled'
        ? 'This order has been cancelled.'
        : req.query.payment === 'success'
          ? 'Razorpay verified your payment successfully.'
          : req.query.payment === 'inventory-issue'
            ? 'Your payment was received, but stock changed before fulfillment. The order is cancelled; contact support for manual refund handling. No refund has been processed automatically.'
            : req.query.payment === 'cancelled'
              ? 'Payment was cancelled. Your order remains pending; you can try again below.'
              : order.paymentMethod === 'cod'
                ? 'Your order is confirmed. Payment will be collected when it is delivered.'
                : null,
      formatPrice: (amount) => Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { showCheckout, submitCheckout, showOrderConfirmation };
