const express = require('express');
const { renderCollection, renderProductDetail } = require('../controllers/productController');

const router = express.Router();
router.get('/', renderCollection);
router.get('/:slug', renderProductDetail);

module.exports = router;
