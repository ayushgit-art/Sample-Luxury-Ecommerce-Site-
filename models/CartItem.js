const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  size: { type: String, default: '' },
  color: { type: String, default: '' },
  quantity: { type: Number, required: true, min: 1 }
}, { timestamps: true });

cartItemSchema.index({ user: 1, product: 1, size: 1, color: 1 }, { unique: true });

module.exports = mongoose.models.CartItem || mongoose.model('CartItem', cartItemSchema);
