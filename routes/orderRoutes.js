const express = require('express');
const { requireAuthPage } = require('../middleware/requireAuth');
const { renderOrderHistory, renderOrderDetail, createRazorpayOrder, verifyRazorpayPayment, markRazorpayPaymentFailed, cancelOrder } = require('../controllers/orderController');

const router = express.Router();
router.use(requireAuthPage);
router.post('/:id/razorpay-order', createRazorpayOrder);
router.post('/:id/verify-payment', verifyRazorpayPayment);
router.post('/:id/payment-failed', markRazorpayPaymentFailed);
router.post('/:id/cancel', cancelOrder);
router.get('/', renderOrderHistory);
router.get('/:id', renderOrderDetail);

module.exports = router;
