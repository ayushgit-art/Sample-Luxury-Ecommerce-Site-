const mongoose = require('mongoose');
const Order = require('../models/Order');

function renderNotFound(res) {
  return res.status(404).render('404', { title: 'Order not found | Maison Atelier' });
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
      formatPrice: (amount) => Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { renderOrderHistory, renderOrderDetail };
