const express = require('express');
const { requireAuthPage } = require('../middleware/requireAuth');
const {
  renderCart,
  getCartState,
  addCartItem,
  updateCartQuantity,
  removeCartItem,
  clearCart
} = require('../controllers/cartController');

const router = express.Router();
router.use(requireAuthPage);
router.get('/', renderCart);
router.get('/state', getCartState);
router.post('/items/:slug', addCartItem);
router.patch('/items/:itemId', updateCartQuantity);
router.delete('/items/:itemId', removeCartItem);
router.delete('/items', clearCart);

module.exports = router;
