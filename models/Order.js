const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
  name: { type: String, required: true, trim: true },
  slug: { type: String, default: '' },
  category: { type: String, default: '' },
  image: { type: String, default: '' },
  quantity: { type: Number, required: true, min: 1 },
  unitPrice: { type: Number, required: true, min: 0 },
  size: { type: String, default: '' },
  color: { type: String, default: '' }
}, { _id: false });

const shippingAddressSchema = new mongoose.Schema({
  recipientName: { type: String, required: true, trim: true },
  addressLine1: { type: String, required: true, trim: true },
  addressLine2: { type: String, default: '', trim: true },
  city: { type: String, required: true, trim: true },
  region: { type: String, default: '', trim: true },
  postalCode: { type: String, required: true, trim: true },
  country: { type: String, required: true, trim: true },
  phone: { type: String, default: '', trim: true }
}, { _id: false });

const orderSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  contactEmail: { type: String, default: '', trim: true, lowercase: true },
  items: { type: [orderItemSchema], required: true, validate: (items) => items.length > 0 },
  shippingAddress: { type: shippingAddressSchema, required: true },
  subtotal: { type: Number, required: true, min: 0 },
  shippingCost: { type: Number, required: true, min: 0 },
  tax: { type: Number, required: true, min: 0 },
  total: { type: Number, required: true, min: 0 },
  paymentStatus: { type: String, enum: ['unpaid', 'pending', 'paid', 'refunded', 'failed'], default: 'unpaid' },
  orderStatus: { type: String, enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'], default: 'pending' }
}, { timestamps: true });

module.exports = mongoose.models.Order || mongoose.model('Order', orderSchema);
