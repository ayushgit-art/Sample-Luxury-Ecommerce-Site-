const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
  category: { type: String, required: true, trim: true },
  subcategory: { type: String, default: '', trim: true },
  description: { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  discountPrice: { type: Number, default: null, min: 0 },
  images: { type: [String], required: true, validate: (images) => images.length > 0 },
  sizes: { type: [String], default: [] },
  colors: { type: [String], default: [] },
  stock: { type: Number, default: 0, min: 0 },
  brand: { type: String, default: 'Maison Atelier', trim: true },
  featured: { type: Boolean, default: false },
  newArrival: { type: Boolean, default: false },
  popularity: { type: Number, default: 0 },
  materials: { type: String, default: '' },
  careInstructions: { type: String, default: '' },
  shippingInformation: { type: String, default: '' },
  returnsInformation: { type: String, default: '' }
}, { timestamps: true });

productSchema.index({ name: 'text', category: 'text', subcategory: 'text', description: 'text', brand: 'text' });

module.exports = mongoose.models.Product || mongoose.model('Product', productSchema);
