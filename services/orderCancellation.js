const Order = require('../models/Order');
const { restoreStock } = require('./inventory');

const cancellableStatuses = ['pending', 'confirmed', 'processing', 'packed'];

function combineOrderQuantities(items) {
  const quantities = new Map();
  for (const item of items) {
    if (!item.product) continue;
    const productId = String(item.product);
    quantities.set(productId, (quantities.get(productId) || 0) + item.quantity);
  }
  return [...quantities].map(([productId, quantity]) => ({ productId, quantity }));
}

async function cancelCustomerOrder(orderId, userId) {
  const order = await Order.findOneAndUpdate(
    {
      _id: orderId,
      orderStatus: { $in: cancellableStatuses },
      inventoryReservationStatus: { $in: ['none', 'reserved', 'consumed', null] },
      $or: [
        { paymentMethod: 'cod' },
        { paymentStatus: { $ne: 'pending' } },
        { razorpayOrderId: { $in: ['', null] } }
      ],
      ...(userId ? { user: userId } : {})
    },
    { $set: { inventoryReservationStatus: 'reserving' } },
    { new: false }
  );
  if (!order) return null;

  const stockWasDeducted = ['reserved', 'consumed'].includes(order.inventoryReservationStatus)
    || (order.orderStatus !== 'pending'
      && (order.paymentMethod === 'cod' || (order.paymentMethod !== 'cod' && order.paymentStatus === 'paid')));
  if (stockWasDeducted) {
    await restoreStock(combineOrderQuantities(order.items));
  }
  const cancelled = await Order.findOneAndUpdate(
    { _id: order._id, inventoryReservationStatus: 'reserving', orderStatus: { $in: cancellableStatuses }, ...(userId ? { user: userId } : {}) },
    { $set: { orderStatus: 'cancelled', inventoryReservationStatus: 'none' } },
    { new: true, runValidators: true }
  );
  if (!cancelled) throw new Error('Order cancellation could not be completed after reserving stock restoration.');
  return cancelled;
}

module.exports = { cancelCustomerOrder, cancellableStatuses };
