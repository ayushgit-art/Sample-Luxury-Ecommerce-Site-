const Review = require('../models/Review');

async function attachReviewStats(products) {
  if (!products.length) return products;
  const summaries = await Review.aggregate([
    { $match: { product: { $in: products.map((product) => product._id) }, isRemoved: { $ne: true } } },
    { $group: { _id: '$product', averageRating: { $avg: '$rating' }, reviewCount: { $sum: 1 } } }
  ]);
  const byProduct = new Map(summaries.map((summary) => [String(summary._id), summary]));
  return products.map((product) => ({
    ...product,
    averageRating: byProduct.get(String(product._id))?.averageRating || 0,
    reviewCount: byProduct.get(String(product._id))?.reviewCount || 0
  }));
}

module.exports = { attachReviewStats };
