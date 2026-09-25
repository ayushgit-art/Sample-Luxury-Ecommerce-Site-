const express = require('express');
const { requireAuthPage } = require('../middleware/requireAuth');
const { getWishlistState, renderWishlist, addWishlistItem, removeWishlistItem } = require('../controllers/wishlistController');

const router = express.Router();
router.get('/state', getWishlistState);
router.get('/', requireAuthPage, renderWishlist);
router.post('/items/:slug', addWishlistItem);
router.delete('/items/:slug', removeWishlistItem);

module.exports = router;
