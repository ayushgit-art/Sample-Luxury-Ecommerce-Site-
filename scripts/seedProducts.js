require('dotenv').config();
const mongoose = require('mongoose');
const connectDatabase = require('../config/database');
const Product = require('../models/Product');
const sampleProducts = require('../data/products');

async function seedProducts() {
  await connectDatabase();
  if (mongoose.connection.readyState !== 1) {
    throw new Error('Set MONGODB_URI in .env before running the catalog seed.');
  }

  const now = Date.now();
  const operations = sampleProducts.map((sample, index) => {
    const { image, color, isFeatured, imageAlt, isNew, ...product } = sample;
    product.newArrival = isNew;
    product.createdAt = new Date(now - (sampleProducts.length - index) * 86400000);
    product.updatedAt = product.createdAt;
    return {
      updateOne: {
        filter: { slug: product.slug },
        update: { $setOnInsert: product },
        upsert: true
      }
    };
  });

  const result = await Product.bulkWrite(operations, { timestamps: false });
  const slugs = sampleProducts.map((product) => product.slug);
  const storedProducts = await Product.find({ slug: { $in: slugs } }).select('slug').lean();
  if (storedProducts.length !== sampleProducts.length) {
    throw new Error(`Expected ${sampleProducts.length} seeded products, retrieved ${storedProducts.length}.`);
  }

  console.info(`Catalog seed complete: ${result.upsertedCount} products inserted; ${storedProducts.length} products retrieved from MongoDB.`);
  await mongoose.disconnect();
}

seedProducts().catch(async (error) => {
  console.error('Unable to seed the product catalog:', error.message);
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  process.exitCode = 1;
});
