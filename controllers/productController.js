const mongoose = require('mongoose');
const Product = require('../models/Product');
const sampleProducts = require('../data/products');

const PAGE_SIZE = 6;
const categories = ['Shoes', 'Clothing', 'Bags', 'Accessories'];
const sortOptions = {
  'price-asc': { price: 1 },
  'price-desc': { price: -1 },
  newest: { createdAt: -1 },
  popularity: { popularity: -1, createdAt: -1 }
};

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildFilter(query) {
  const filter = {};
  if (query.category && categories.includes(query.category)) filter.category = query.category;
  if (query.size) filter.sizes = query.size;
  if (query.color) filter.colors = query.color;

  const minPrice = Number(query.minPrice);
  const maxPrice = Number(query.maxPrice);
  if (Number.isFinite(minPrice) && query.minPrice !== '') filter.price = { ...filter.price, $gte: minPrice };
  if (Number.isFinite(maxPrice) && query.maxPrice !== '') filter.price = { ...filter.price, $lte: maxPrice };

  if (query.q && String(query.q).trim()) {
    const expression = new RegExp(escapeRegExp(String(query.q).trim()), 'i');
    filter.$or = ['name', 'category', 'subcategory', 'description', 'brand'].map((field) => ({ [field]: expression }));
  }
  return filter;
}

function filterSampleProducts(filter) {
  return sampleProducts.filter((product) => {
    if (filter.category && product.category !== filter.category) return false;
    if (filter.sizes && !product.sizes.includes(filter.sizes)) return false;
    if (filter.colors && !product.colors.includes(filter.colors)) return false;
    if (filter.price?.$gte !== undefined && product.price < filter.price.$gte) return false;
    if (filter.price?.$lte !== undefined && product.price > filter.price.$lte) return false;
    if (filter.$or && !filter.$or.some((clause) => Object.values(clause)[0].test(`${product.name} ${product.category} ${product.subcategory} ${product.description} ${product.brand}`))) return false;
    return true;
  });
}

function sortSampleProducts(products, sortName) {
  const result = [...products];
  if (sortName === 'price-asc') return result.sort((a, b) => a.price - b.price);
  if (sortName === 'price-desc') return result.sort((a, b) => b.price - a.price);
  if (sortName === 'popularity') return result.sort((a, b) => b.popularity - a.popularity);
  return result;
}

async function renderCollection(req, res, next) {
  const filter = buildFilter(req.query);
  const requestedPage = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const sortName = sortOptions[req.query.sort] ? req.query.sort : 'newest';
  const sort = sortOptions[sortName];
  const databaseConnected = mongoose.connection.readyState === 1;

  try {
    let products;
    let total;
    let filterOptions;
    let currentPage;
    let pageCount;

    if (databaseConnected) {
      [total, filterOptions] = await Promise.all([
        Product.countDocuments(filter),
        Promise.all([Product.distinct('sizes'), Product.distinct('colors')])
      ]);
      pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
      currentPage = Math.min(requestedPage, pageCount);
      products = await Product.find(filter).sort(sort).skip((currentPage - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean();
    } else {
      const matchingProducts = sortSampleProducts(filterSampleProducts(filter), sortName);
      total = matchingProducts.length;
      pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
      currentPage = Math.min(requestedPage, pageCount);
      products = matchingProducts.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
      filterOptions = [
        [...new Set(sampleProducts.flatMap((product) => product.sizes))].sort(),
        [...new Set(sampleProducts.flatMap((product) => product.colors))].sort()
      ];
    }

    const query = { ...req.query };
    delete query.page;

    res.render('product-list', {
      title: 'The Collection | Maison Atelier',
      products,
      categories,
      sizes: filterOptions[0],
      colors: filterOptions[1],
      filters: req.query,
      sortName,
      total,
      currentPage,
      pageCount,
      queryString: new URLSearchParams(query).toString()
    });
  } catch (error) {
    next(error);
  }
}

async function renderProductDetail(req, res, next) {
  try {
    let product;
    let relatedProducts;
    if (mongoose.connection.readyState === 1) {
      product = await Product.findOne({ slug: req.params.slug }).lean();
      if (product) {
        relatedProducts = await Product.find({ category: product.category, slug: { $ne: product.slug } }).limit(4).lean();
      }
    } else {
      product = sampleProducts.find((item) => item.slug === req.params.slug);
      relatedProducts = product
        ? sampleProducts.filter((item) => item.category === product.category && item.slug !== product.slug).slice(0, 4)
        : [];
    }

    if (!product) return res.status(404).render('404', { title: 'Piece not found | Maison Atelier' });
    res.render('product-detail', {
      title: `${product.name} | Maison Atelier`,
      product,
      relatedProducts,
      reviews: []
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { renderCollection, renderProductDetail };
