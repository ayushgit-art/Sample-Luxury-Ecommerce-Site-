const express = require('express');
const { requireAuthPage } = require('../middleware/requireAuth');
const { renderOrderHistory, renderOrderDetail } = require('../controllers/orderController');

const router = express.Router();
router.use(requireAuthPage);
router.get('/', renderOrderHistory);
router.get('/:id', renderOrderDetail);

module.exports = router;
