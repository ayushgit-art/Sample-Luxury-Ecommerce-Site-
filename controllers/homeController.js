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
        { name: 'Shoes', note: 'Considered from every angle', image: 'https://images.unsplash.com/photo-1543163521-1bf539c55dd2?auto=format&fit=crop&w=1100&q=85', href: '/products?category=Shoes' },
        { name: 'Clothing', note: 'A quieter kind of statement', image: 'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?auto=format&fit=crop&w=1100&q=85', href: '/products?category=Clothing' },
        { name: 'Bags', note: 'Made to move with you', image: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=1100&q=85', href: '/products?category=Bags' },
        { name: 'Accessories', note: 'The finishing touch', image: 'https://images.unsplash.com/photo-1624222247344-550fb8c9b5b9?auto=format&fit=crop&w=1100&q=85', href: '/products?category=Accessories' }
      ]
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { renderHome };
