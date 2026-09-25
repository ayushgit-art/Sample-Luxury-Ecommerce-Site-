const Product = require('../models/Product');
const User = require('../models/User');

function loginUrlForRequest(req) {
  let returnTo = '/wishlist';
  try {
    const referer = req.get('referer');
    if (referer) {
      const url = new URL(referer);
      returnTo = `${url.pathname}${url.search}`;
    }
  } catch (_error) {
    returnTo = '/wishlist';
  }
  return `/login?returnTo=${encodeURIComponent(returnTo)}`;
}

async function getWishlistState(req, res, next) {
  if (!req.session.userId) return res.json({ authenticated: false, slugs: [] });

  try {
    const user = await User.findById(req.session.userId).populate('wishlist', 'slug').lean();
    if (!user) return res.json({ authenticated: false, slugs: [] });
    res.json({ authenticated: true, slugs: user.wishlist.map((product) => product.slug) });
  } catch (error) {
    next(error);
  }
}

async function renderWishlist(req, res, next) {
  try {
    const user = await User.findById(req.session.userId).populate('wishlist').lean();
    if (!user) {
      return req.session.destroy(() => res.redirect('/login?returnTo=%2Fwishlist'));
    }
    res.render('wishlist', {
      title: 'Your wishlist | Maison Atelier',
      products: user.wishlist,
      email: user.email
    });
  } catch (error) {
    next(error);
  }
}

async function addWishlistItem(req, res, next) {
  try {
    if (!req.session.userId) return res.status(401).json({ loginUrl: loginUrlForRequest(req) });
    const product = await Product.findOne({ slug: req.params.slug }).select('_id slug');
    if (!product) return res.status(404).json({ error: 'Product not found.' });

    const user = await User.findByIdAndUpdate(
      req.session.userId,
      { $addToSet: { wishlist: product._id } },
      { new: true }
    ).populate('wishlist', 'slug').lean();
    if (!user) return res.status(401).json({ loginUrl: loginUrlForRequest(req) });
    res.json({ saved: true, slugs: user.wishlist.map((item) => item.slug), count: user.wishlist.length });
  } catch (error) {
    next(error);
  }
}

async function removeWishlistItem(req, res, next) {
  try {
    if (!req.session.userId) return res.status(401).json({ loginUrl: loginUrlForRequest(req) });
    const product = await Product.findOne({ slug: req.params.slug }).select('_id slug');
    if (!product) return res.status(404).json({ error: 'Product not found.' });

    const user = await User.findByIdAndUpdate(
      req.session.userId,
      { $pull: { wishlist: product._id } },
      { new: true }
    ).populate('wishlist', 'slug').lean();
    if (!user) return res.status(401).json({ loginUrl: loginUrlForRequest(req) });
    res.json({ saved: false, slugs: user.wishlist.map((item) => item.slug), count: user.wishlist.length });
  } catch (error) {
    next(error);
  }
}

module.exports = { getWishlistState, renderWishlist, addWishlistItem, removeWishlistItem };
