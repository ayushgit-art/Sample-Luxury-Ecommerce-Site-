const express = require('express');
const { requireAuthPage } = require('../middleware/requireAuth');
const { showCheckout, submitCheckout, showOrderConfirmation } = require('../controllers/checkoutController');

const router = express.Router();
router.get('/checkout', requireAuthPage, showCheckout);
router.post('/checkout', requireAuthPage, submitCheckout);
router.get('/order-confirmation/:id', requireAuthPage, showOrderConfirmation);

module.exports = router;
