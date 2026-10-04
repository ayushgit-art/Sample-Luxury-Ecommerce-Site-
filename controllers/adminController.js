const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('node:path');
const { uploadProductImage, deleteProductImage } = require('../config/cloudinary');
const CartItem = require('../models/CartItem');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Review = require('../models/Review');
const User = require('../models/User');
const { deleteReview } = require('./reviewController');
const { cancelCustomerOrder } = require('../services/orderCancellation');

const orderStatuses = ['pending', 'confirmed', 'processing', 'packed', 'shipped', 'delivered', 'cancelled'];
const maximumImageCount = 8;
const maximumImageSize = 5 * 1024 * 1024;
const productImageDirectory = path.join(__dirname, '..', 'uploads', 'products');
const allowedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
const parseEditProductImageUploads = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maximumImageSize, files: maximumImageCount, fields: 24, fieldSize: 16000, parts: 40 },
  fileFilter(_req, file, callback) {
    if (!allowedImageTypes.has(file.mimetype)) {
      return callback(new Error('Upload JPG, PNG, WebP, or AVIF images only.'));
    }
    callback(null, true);
  }
}).array('imageFiles', maximumImageCount);
const parseProductImageUploads = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maximumImageSize, files: maximumImageCount, fields: 24, fieldSize: 16000, parts: 40 },
  fileFilter(_req, file, callback) {
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.mimetype)) {
      return callback(new Error('Upload JPEG, PNG, WebP, or AVIF images only.'));
    }
    callback(null, true);
  }
}).array('images', maximumImageCount);

function slugify(value) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function parseList(value) {
  if (typeof value !== 'string') return [];
  return [...new Set(value.split(/[\n,]+/).map((part) => part.trim()).filter(Boolean))];
}

function parseImageUrls(value, preserveOrder = false) {
  if (typeof value !== 'string') return [];
  const images = value.split(/[\r\n]+/).map((image) => image.trim()).filter(Boolean);
  return preserveOrder ? images : [...new Set(images)];
}

function imageExtension(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return '.jpg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return '.png';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return '.webp';
  if (buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp') {
    const brands = [buffer.toString('ascii', 8, 12)];
    for (let offset = 16; offset + 4 <= buffer.length; offset += 4) {
      brands.push(buffer.toString('ascii', offset, offset + 4));
    }
    if (brands.some((brand) => brand === 'avif' || brand === 'avis')) return '.avif';
  }
  return null;
}

function parseProductInput(body, uploadedImages = [], { allowEmptyImages = false, preserveImageOrder = false } = {}) {
  const name = String(body.name || '').trim();
  const slug = slugify(String(body.slug || name).trim());
  const category = String(body.category || '').trim();
  const description = String(body.description || '').trim();
  const priceText = String(body.price ?? '').trim();
  const stockText = String(body.stock ?? '').trim();
  const discountText = String(body.discountPrice ?? '').trim();
  const price = Number(priceText);
  const stock = Number(stockText);
  const discountPrice = discountText ? Number(discountText) : null;
  const sizes = parseList(body.sizes);
  const colors = parseList(body.colors);
  const images = uploadedImages.length ? uploadedImages : parseImageUrls(body.images, preserveImageOrder);
  const errors = [];

  if (name.length < 2 || name.length > 120) errors.push('Product name must be between 2 and 120 characters.');
  if (!slug || slug.length > 120 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) errors.push('Enter a valid product slug.');
  if (!category || category.length > 64) errors.push('Enter a category of 1 to 64 characters.');
  if (String(body.subcategory || '').trim().length > 64) errors.push('Subcategory must be 64 characters or fewer.');
  if (String(body.brand || '').trim().length > 80) errors.push('Brand must be 80 characters or fewer.');
  if (description.length < 5 || description.length > 5000) errors.push('Description must be between 5 and 5,000 characters.');
  if (!priceText || !Number.isFinite(price) || price < 0) errors.push('Enter a valid non-negative price.');
  if (!Number.isInteger(stock) || stock < 0) errors.push('Stock must be a non-negative whole number.');
  if (discountPrice !== null && (!Number.isFinite(discountPrice) || discountPrice < 0 || discountPrice > price)) {
    errors.push('Discount price must be between zero and the regular price.');
  }
  if (sizes.length > 40 || sizes.some((size) => size.length > 32)) errors.push('Check the size list; each size must be 32 characters or fewer.');
  if (colors.length > 40 || colors.some((color) => color.length > 48)) errors.push('Check the color list; each color must be 48 characters or fewer.');
  if ((!images.length && !allowEmptyImages) || images.length > maximumImageCount) errors.push(`Provide between 1 and ${maximumImageCount} product images.`);
  if (images.some((image) => image.length > 2048 || (() => {
    if (/^\/uploads\/products\/[a-f0-9-]{36}\.(?:jpg|png|webp|avif)$/i.test(image)) return false;
    try {
      const url = new URL(image);
      return !['http:', 'https:'].includes(url.protocol);
    } catch (_error) {
      return true;
    }
  })())) errors.push('Each image must be a valid HTTP or HTTPS URL no longer than 2,048 characters.');

  return {
    errors,
    values: {
      name,
      slug,
      category,
      subcategory: String(body.subcategory || '').trim(),
      description,
      price: priceText,
      discountPrice: discountText,
      stock: stockText,
      brand: String(body.brand || 'Maison Atelier').trim(),
      sizesText: sizes.join(', '),
      colorsText: colors.join(', '),
      imagesText: images.join('\n'),
      featured: body.featured === 'on' || body.featured === 'true',
      newArrival: body.newArrival === 'on' || body.newArrival === 'true'
    },
    product: {
      name,
      slug,
      category,
      subcategory: String(body.subcategory || '').trim(),
      description,
      price,
      discountPrice,
      stock,
      brand: String(body.brand || 'Maison Atelier').trim() || 'Maison Atelier',
      sizes,
      colors,
      images,
      featured: body.featured === 'on' || body.featured === 'true',
      newArrival: body.newArrival === 'on' || body.newArrival === 'true'
    }
  };
}

function renderProductForm(res, { title, values, error = null, status = 200, productId = null }) {
  return res.status(status).render('admin/product-form', { title, values, error, productId });
}

async function removeUploadedImages(images) {
  await Promise.all(images.map((image) => fs.rm(path.join(productImageDirectory, path.basename(image)), { force: true })));
}

function uploadProductImages(req, res, next) {
  parseProductImageUploads(req, res, async (uploadError) => {
    if (uploadError) {
      const message = uploadError.code === 'LIMIT_FILE_SIZE'
        ? 'Each image must be 5 MB or smaller.'
        : uploadError.code === 'LIMIT_FILE_COUNT' || uploadError.code === 'LIMIT_UNEXPECTED_FILE'
          ? `Upload no more than ${maximumImageCount} images.`
          : uploadError.message;
      return renderProductForm(res, {
        title: 'Add product | Maison Atelier Admin',
        values: req.body || {},
        error: message,
        status: 422
      });
    }

    const files = req.files || [];
    const extensions = files.map((file) => imageExtension(file.buffer));
    if (extensions.some((extension) => !extension)) {
      return renderProductForm(res, {
        title: 'Add product | Maison Atelier Admin',
        values: req.body || {},
        error: 'Upload valid JPEG, PNG, or WebP image files.',
        status: 422
      });
    }

    const savedImages = [];
    try {
      await fs.mkdir(productImageDirectory, { recursive: true });
      for (let index = 0; index < files.length; index += 1) {
        const filename = `${crypto.randomUUID()}${extensions[index]}`;
        savedImages.push(`/uploads/products/${filename}`);
        await fs.writeFile(path.join(productImageDirectory, filename), files[index].buffer, { flag: 'wx', mode: 0o644 });
      }
      req.uploadedProductImages = savedImages;
      next();
    } catch (error) {
      try {
        await removeUploadedImages(savedImages);
      } catch (cleanupError) {
        return next(new AggregateError([error, cleanupError], 'Unable to save or clean up uploaded product images.'));
      }
      next(error);
    }
  });
}

function uploadEditProductImages(req, res, next) {
  parseEditProductImageUploads(req, res, (uploadError) => {
    if (uploadError) {
      const message = uploadError.code === 'LIMIT_FILE_SIZE'
        ? 'Each image must be 5 MB or smaller.'
        : uploadError.code === 'LIMIT_FILE_COUNT' || uploadError.code === 'LIMIT_UNEXPECTED_FILE'
          ? `Upload no more than ${maximumImageCount} images.`
          : uploadError.message;
      return renderProductForm(res, {
        title: 'Edit product | Maison Atelier Admin',
        productId: req.params.id,
        values: parseProductInput(req.body || {}).values,
        error: message,
        status: 422
      });
    }

    const files = req.files || [];
    if (files.some((file) => !imageExtension(file.buffer))) {
      return renderProductForm(res, {
        title: 'Edit product | Maison Atelier Admin',
        productId: req.params.id,
        values: parseProductInput(req.body || {}).values,
        error: 'Upload valid JPG, PNG, WebP, or AVIF image files.',
        status: 422
      });
    }

    next();
  });
}

async function renderDashboard(_req, res, next) {
  try {
    const [totalProducts, totalUsers, totalOrders, pendingOrders, revenueRows, lowStockCount, lowStockProducts] = await Promise.all([
      Product.countDocuments(),
      User.countDocuments(),
      Order.countDocuments(),
      Order.countDocuments({ orderStatus: 'pending' }),
      Order.aggregate([{ $match: { paymentStatus: 'paid' } }, { $group: { _id: null, total: { $sum: '$total' } } }]),
      Product.countDocuments({ stock: { $lte: 5 } }),
      Product.find({ stock: { $lte: 5 } }).sort({ stock: 1, name: 1 }).limit(8).lean()
    ]);

    res.render('admin/dashboard', {
      title: 'Administration | Maison Atelier',
      metrics: { totalProducts, totalUsers, totalOrders, pendingOrders, revenue: revenueRows[0]?.total || 0, lowStockCount },
      lowStockProducts
    });
  } catch (error) {
    next(error);
  }
}

async function renderProducts(req, res, next) {
  try {
    const products = await Product.find().sort({ updatedAt: -1, name: 1 }).lean();
    const notices = {
      created: 'Product created.',
      updated: 'Product updated.',
      deleted: 'Product deleted.',
      referenced: 'This product is used by a wishlist, cart, or order and cannot be deleted.'
    };
    res.render('admin/products', {
      title: 'Products | Maison Atelier Admin',
      products,
      notice: notices[req.query.notice] || null
    });
  } catch (error) {
    next(error);
  }
}

function renderNewProduct(_req, res) {
  renderProductForm(res, {
    title: 'Add product | Maison Atelier Admin',
    values: { brand: 'Maison Atelier', price: '', discountPrice: '', stock: '0', sizesText: '', colorsText: '', imagesText: '', featured: false, newArrival: false }
  });
}

async function createProduct(req, res, next) {
  const uploadedImages = req.uploadedProductImages || [];

  try {
    const parsed = parseProductInput(req.body, uploadedImages);
    if (parsed.errors.length) {
      await removeUploadedImages(uploadedImages);
      return renderProductForm(res, { title: 'Add product | Maison Atelier Admin', values: parsed.values, error: parsed.errors.join(' '), status: 422 });
    }

    await Product.create(parsed.product);
    res.redirect('/admin/products?notice=created');
  } catch (error) {
    try {
      await removeUploadedImages(uploadedImages);
    } catch (cleanupError) {
      return next(new AggregateError([error, cleanupError], 'Unable to create the product or clean up its uploaded images.'));
    }
    if (error.code === 11000) {
      return renderProductForm(res, { title: 'Add product | Maison Atelier Admin', values: parseProductInput(req.body, uploadedImages).values, error: 'A product already uses this slug.', status: 409 });
    }
    next(error);
  }
}

async function renderEditProduct(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).render('404', { title: 'Product not found | Maison Atelier' });
  try {
    const product = await Product.findById(req.params.id).lean();
    if (!product) return res.status(404).render('404', { title: 'Product not found | Maison Atelier' });
    renderProductForm(res, {
      title: `Edit ${product.name} | Maison Atelier Admin`,
      productId: product._id,
      values: {
        ...product,
        price: String(product.price),
        discountPrice: product.discountPrice == null ? '' : String(product.discountPrice),
        stock: String(product.stock),
        sizesText: product.sizes.join(', '),
        colorsText: product.colors.join(', '),
        imagesText: product.images.join('\n')
      }
    });
  } catch (error) {
    next(error);
  }
}

async function updateProduct(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).render('404', { title: 'Product not found | Maison Atelier' });
  const files = req.files || [];
  const parsed = parseProductInput(req.body, [], { allowEmptyImages: files.length > 0, preserveImageOrder: true });
  if (parsed.errors.length) {
    return renderProductForm(res, { title: 'Edit product | Maison Atelier Admin', productId: req.params.id, values: parsed.values, error: parsed.errors.join(' '), status: 422 });
  }

  const uploadedImages = [];
  try {
    const existingProduct = await Product.findById(req.params.id).select('_id').lean();
    if (!existingProduct) return res.status(404).render('404', { title: 'Product not found | Maison Atelier' });

    for (let index = 0; index < files.length; index += 1) {
      const image = await uploadProductImage(files[index].buffer, crypto.randomUUID());
      uploadedImages.push(image);
    }

    const images = [...parsed.product.images];
    uploadedImages.forEach((image, index) => {
      if (index < images.length) images[index] = image.url;
      else images.push(image.url);
    });
    parsed.product.images = images;
    const updatedProduct = await Product.findByIdAndUpdate(req.params.id, { $set: parsed.product }, { new: true, runValidators: true });
    if (!updatedProduct) {
      const missingProductError = new Error('Product not found.');
      missingProductError.code = 'PRODUCT_NOT_FOUND';
      throw missingProductError;
    }
    res.redirect('/admin/products?notice=updated');
  } catch (error) {
    try {
      await Promise.all(uploadedImages.map((image) => deleteProductImage(image.publicId)));
    } catch (cleanupError) {
      return next(new AggregateError([error, cleanupError], 'Unable to update the product or clean up its Cloudinary images.'));
    }
    if (error.code === 11000) {
      return renderProductForm(res, { title: 'Edit product | Maison Atelier Admin', productId: req.params.id, values: parsed.values, error: 'A product already uses this slug.', status: 409 });
    }
    if (error.code === 'PRODUCT_NOT_FOUND') return res.status(404).render('404', { title: 'Product not found | Maison Atelier' });
    if (error.message?.startsWith('Set CLOUDINARY_')) {
      return renderProductForm(res, { title: 'Edit product | Maison Atelier Admin', productId: req.params.id, values: parsed.values, error: error.message, status: 503 });
    }
    next(error);
  }
}

async function deleteProduct(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).render('404', { title: 'Product not found | Maison Atelier' });
  try {
    const product = await Product.findById(req.params.id).select('_id');
    if (!product) return res.status(404).render('404', { title: 'Product not found | Maison Atelier' });

    const [inWishlist, inCart, inOrders] = await Promise.all([
      User.exists({ wishlist: product._id }),
      CartItem.exists({ product: product._id }),
      Order.exists({ 'items.product': product._id })
    ]);
    if (inWishlist || inCart || inOrders) return res.redirect('/admin/products?notice=referenced');

    await Product.deleteOne({ _id: product._id });
    res.redirect('/admin/products?notice=deleted');
  } catch (error) {
    next(error);
  }
}

async function renderOrders(_req, res, next) {
  try {
    const orders = await Order.find().populate('user', 'name email').sort({ createdAt: -1 }).lean();
    res.render('admin/orders', { title: 'Orders | Maison Atelier Admin', orders });
  } catch (error) {
    next(error);
  }
}

async function renderOrder(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).render('404', { title: 'Order not found | Maison Atelier' });
  try {
    const order = await Order.findById(req.params.id).populate('user', 'name email').lean();
    if (!order) return res.status(404).render('404', { title: 'Order not found | Maison Atelier' });
    res.render('order-detail', {
      title: `Order ${String(order._id).slice(-8).toUpperCase()} | Maison Atelier Admin`,
      order,
      confirmation: false,
      isAdminView: true,
      cancellationError: '',
      canCancel: false,
      formatPrice: (amount) => Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    });
  } catch (error) {
    next(error);
  }
}

async function updateOrderStatus(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).render('404', { title: 'Order not found | Maison Atelier' });
  const orderStatus = String(req.body.orderStatus || '');
  if (!orderStatuses.includes(orderStatus)) {
    return res.status(422).render('admin/forbidden', { title: 'Invalid order status | Maison Atelier Admin' });
  }
  try {
    if (orderStatus === 'cancelled') {
      const currentOrder = await Order.findById(req.params.id).select('orderStatus');
      if (!currentOrder) return res.status(404).render('404', { title: 'Order not found | Maison Atelier' });
      if (['pending', 'confirmed', 'processing', 'packed'].includes(currentOrder.orderStatus)) {
        const cancelled = await cancelCustomerOrder(currentOrder._id);
        if (!cancelled) return res.status(409).render('admin/forbidden', { title: 'Order status changed | Maison Atelier Admin' });
        return res.redirect(`/admin/orders/${cancelled._id}`);
      }
      return res.status(409).render('admin/forbidden', { title: 'Order cannot be cancelled | Maison Atelier Admin' });
    }
    const order = await Order.findByIdAndUpdate(req.params.id, { $set: { orderStatus } }, { new: true, runValidators: true });
    if (!order) return res.status(404).render('404', { title: 'Order not found | Maison Atelier' });
    res.redirect(`/admin/orders/${order._id}`);
  } catch (error) {
    next(error);
  }
}

async function renderUsers(_req, res, next) {
  try {
    const users = await User.find().select('name email role createdAt').sort({ createdAt: -1 }).lean();
    res.render('admin/users', { title: 'Users | Maison Atelier Admin', users });
  } catch (error) {
    next(error);
  }
}

async function renderReviews(_req, res, next) {
  try {
    const reviews = await Review.find({ isRemoved: { $ne: true } })
      .populate('user', 'name email')
      .populate('product', 'name slug')
      .populate('order', 'createdAt')
      .sort({ createdAt: -1 })
      .lean();
    res.render('admin/reviews', { title: 'Reviews | Maison Atelier Admin', reviews });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  renderDashboard,
  renderProducts,
  renderNewProduct,
  uploadProductImages,
  uploadEditProductImages,
  createProduct,
  renderEditProduct,
  updateProduct,
  deleteProduct,
  renderOrders,
  renderOrder,
  updateOrderStatus,
  renderReviews,
  deleteReview,
  renderUsers
};
