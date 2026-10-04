const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Review = require('../models/Review');
const User = require('../models/User');

function redirectWithMessage(res, slug, key, message) {
  return res.redirect(`/products/${encodeURIComponent(slug)}?${key}=${encodeURIComponent(message)}#client-reviews`);
}

function sanitizeReviewBody(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function submitReview(req, res, next) {
  const rating = Number(req.body.rating);
  const body = sanitizeReviewBody(req.body.body);
  const orderId = String(req.body.orderId || '');
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return redirectWithMessage(res, req.params.slug, 'reviewError', 'Choose a rating from 1 to 5 stars.');
  }
  if (body.length < 10 || body.length > 1000) {
    return redirectWithMessage(res, req.params.slug, 'reviewError', 'Write a review between 10 and 1,000 characters.');
  }
  if (!mongoose.isValidObjectId(orderId)) {
    return redirectWithMessage(res, req.params.slug, 'reviewError', 'Select an eligible order for this product.');
  }

  try {
    const [user, product, order] = await Promise.all([
      User.findById(req.session.userId).select('name role').lean(),
      Product.findOne({ slug: req.params.slug }).select('_id slug').lean(),
      Order.findOne({
        _id: orderId,
        user: req.session.userId,
        orderStatus: { $in: ['confirmed', 'processing', 'packed', 'shipped', 'delivered'] },
        $or: [{ paymentMethod: 'cod' }, { paymentStatus: 'paid' }],
        'items.product': { $exists: true }
      }).select('items.product').lean()
    ]);
    if (!user || user.role !== 'customer') return res.status(403).render('admin/forbidden', { title: 'Reviews are for customers | Maison Atelier' });
    if (!product) return res.status(404).render('404', { title: 'Piece not found | Maison Atelier' });
    if (!order || !order.items.some((item) => String(item.product) === String(product._id))) {
      return redirectWithMessage(res, product.slug, 'reviewError', 'Reviews are available after ordering this piece.');
    }

    const existingReview = await Review.findOne({ product: product._id, user: user._id, order: order._id }).select('isRemoved');
    if (existingReview?.isRemoved) {
      return redirectWithMessage(res, product.slug, 'reviewError', 'This review was removed by an administrator and cannot be resubmitted.');
    }

    await Review.findOneAndUpdate(
      { product: product._id, user: user._id, order: order._id },
      { $set: { reviewerName: user.name, rating, body } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    return redirectWithMessage(res, product.slug, 'reviewNotice', 'Thank you. Your review has been saved.');
  } catch (error) {
    if (error.code === 11000) {
      return redirectWithMessage(res, req.params.slug, 'reviewError', 'A review already exists for this product and order. Edit your existing review instead.');
    }
    next(error);
  }
}

async function deleteReview(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.reviewId)) return res.status(404).render('404', { title: 'Review not found | Maison Atelier' });
  try {
    const review = await Review.findOneAndUpdate(
      { _id: req.params.reviewId, isRemoved: { $ne: true } },
      { $set: { isRemoved: true } },
      { new: true }
    ).select('product');
    if (!review) return res.status(404).render('404', { title: 'Review not found | Maison Atelier' });
    const product = await Product.findById(review.product).select('slug');
    res.redirect(product ? `/products/${encodeURIComponent(product.slug)}#client-reviews` : '/products');
  } catch (error) {
    next(error);
  }
}

module.exports = { submitReview, deleteReview, sanitizeReviewBody };
