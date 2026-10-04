const mongoose = require('mongoose');
const Product = require('../models/Product');
const sampleProducts = require('../data/products');

async function renderHome(_req, res, next) {
  try {
    let newArrivals;
    let featuredProducts;
    if (mongoose.connection.readyState === 1) {
      [newArrivals, featuredProducts] = await Promise.all([
        Product.find().sort({ createdAt: -1 }).limit(6).lean(),
        Product.find({ featured: true }).sort({ createdAt: -1 }).limit(4).lean()
      ]);
    } else {
      newArrivals = sampleProducts.slice(0, 6);
      featuredProducts = sampleProducts.filter((product) => product.featured).slice(0, 4);
    }

    res.render('home', {
      title: 'Maison Atelier | Objects of enduring beauty',
      newArrivals,
      featuredProducts,
      categories: [
        { name: 'Shoes', note: 'Considered from every angle', image: '/images/Cardimages/leathermule.avif', href: '/products?category=Shoes' },
        { name: 'Clothing', note: 'A quieter kind of statement', image: '/images/Cardimages/shirt.avif', href: '/products?category=Clothing' },
        { name: 'Bags', note: 'Made to move with you', image: '/images/Cardimages/redbag.avif', href: '/products?category=Bags' },
        { name: 'Accessories', note: 'The finishing touch', image: '/images/Cardimages/photo-1752386268324-0533ffbfbc0e.avif', href: '/products?category=Accessories' }
      ]
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { renderHome };
