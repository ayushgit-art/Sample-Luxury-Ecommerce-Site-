const Order = require('../models/Order');
const Product = require('../models/Product');

function quantitiesByProduct(items) {
  const quantities = new Map();
  for (const item of items) {
    if (!item.product) throw new Error(`Product stock is unavailable for ${item.name}.`);
    const productId = String(item.product);
    quantities.set(productId, (quantities.get(productId) || 0) + item.quantity);
  }
  return quantities;
}

async function validateOrderStock(items) {
  const quantities = quantitiesByProduct(items);
  for (const [productId, quantity] of quantities) {
    const product = await Product.findOne({ _id: productId, stock: { $gte: quantity } }).select('_id');
    if (!product) {
      const error = new Error('Stock changed while you were checking out. Review your bag and try again.');
      error.code = 'INSUFFICIENT_STOCK';
      throw error;
    }
  }
}

async function restoreStock(deductions) {
  const results = await Promise.all(deductions.map(({ productId, quantity }) =>
    Product.updateOne({ _id: productId }, { $inc: { stock: quantity } })
  ));
  if (results.some((result) => result.modifiedCount !== 1)) {
    throw new Error('Unable to restore all product stock after a failed order update.');
  }
}

async function deductOrderStock(items) {
  const quantities = quantitiesByProduct(items);
  const deductions = [];
  try {
    for (const [productId, quantity] of quantities) {
      const result = await Product.updateOne(
        { _id: productId, stock: { $gte: quantity } },
        { $inc: { stock: -quantity } }
      );
      if (result.modifiedCount !== 1) {
        const error = new Error('Stock changed before the order could be confirmed. Please contact us for assistance.');
        error.code = 'INSUFFICIENT_STOCK';
        throw error;
      }
      deductions.push({ productId, quantity });
    }
    return deductions;
  } catch (error) {
    try {
      await restoreStock(deductions);
    } catch (restoreError) {
      throw new AggregateError([error, restoreError], 'Stock deduction failed and rollback was incomplete.');
    }
    throw error;
  }
}

async function validateOrderReservation(items) {
  const quantities = quantitiesByProduct(items);
  for (const productId of quantities.keys()) {
    // Reserved quantities have already been removed from available stock.
    if (!await Product.exists({ _id: productId, stock: { $gte: 0 } })) {
      const error = new Error('A reserved product is no longer available.');
      error.code = 'INVALID_STOCK_RESERVATION';
      throw error;
    }
  }
}

async function reserveOrderStock(order) {
  if (order.inventoryReservationStatus === 'reserved') return false;

  const claimedOrder = await Order.findOneAndUpdate(
    {
      _id: order._id,
      paymentMethod: { $in: ['online', null] },
      paymentStatus: { $in: ['pending', 'failed'] },
      orderStatus: { $ne: 'cancelled' },
      inventoryReservationStatus: { $in: ['none', null] }
    },
    { $set: { inventoryReservationStatus: 'reserving' } },
    { new: true }
  );
  if (!claimedOrder) {
    const currentOrder = await Order.findById(order._id).select('inventoryReservationStatus orderStatus paymentStatus');
    if (currentOrder?.inventoryReservationStatus === 'reserved') return false;
    const error = new Error('This order is already being reserved or is no longer available for payment.');
    error.code = 'STOCK_RESERVATION_UNAVAILABLE';
    throw error;
  }

  let deductions = [];
  try {
    deductions = await deductOrderStock(order.items);
    const result = await Order.updateOne(
      {
        _id: order._id,
        inventoryReservationStatus: 'reserving',
        paymentStatus: { $in: ['pending', 'failed'] },
        orderStatus: { $ne: 'cancelled' }
      },
      { $set: { inventoryReservationStatus: 'reserved' } }
    );
    if (result.modifiedCount !== 1) {
      await restoreStock(deductions);
      deductions = [];
      const error = new Error('The order changed before inventory could be reserved.');
      error.code = 'STOCK_RESERVATION_UNAVAILABLE';
      throw error;
    }
    return true;
  } catch (error) {
    try {
      if (deductions.length) await restoreStock(deductions);
      await Order.updateOne(
        { _id: order._id, inventoryReservationStatus: 'reserving' },
        { $set: { inventoryReservationStatus: 'none' } }
      );
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Inventory reservation failed and rollback was incomplete.');
    }
    throw error;
  }
}

async function releaseOrderStockReservation(order, allowProviderOrder = false) {
  const razorpayOrderCondition = allowProviderOrder ? {} : { razorpayOrderId: { $in: ['', null] } };
  const claimedOrder = await Order.findOneAndUpdate(
    {
      _id: order._id,
      ...razorpayOrderCondition,
      inventoryReservationStatus: 'reserved'
    },
    { $set: { inventoryReservationStatus: 'reserving' } },
    { new: true }
  );
  if (!claimedOrder) return;

  try {
    await restoreStock(order.items.map((item) => ({
      productId: String(item.product),
      quantity: item.quantity
    })).reduce((deductions, deduction) => {
      const existing = deductions.find((entry) => entry.productId === deduction.productId);
      if (existing) existing.quantity += deduction.quantity;
      else deductions.push(deduction);
      return deductions;
    }, []));
    const result = await Order.updateOne(
      { _id: order._id, inventoryReservationStatus: 'reserving' },
      { $set: { inventoryReservationStatus: 'none' } }
    );
    if (result.modifiedCount !== 1) throw new Error('Unable to release the order inventory reservation.');
  } catch (error) {
    throw new Error(`Unable to release reserved inventory: ${error.message}`, { cause: error });
  }
}

module.exports = {
  validateOrderStock,
  validateOrderReservation,
  deductOrderStock,
  reserveOrderStock,
  releaseOrderStockReservation,
  restoreStock
};
