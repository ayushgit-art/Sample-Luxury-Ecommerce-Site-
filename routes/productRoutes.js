const express = require('express');
const { renderCollection, renderProductDetail } = require('../controllers/productController');
const { requireAuthPage } = require('../middleware/requireAuth');
const { submitReview } = require('../controllers/reviewController');

const router = express.Router();
router.get('/', renderCollection);
router.post('/:slug/reviews', requireAuthPage, submitReview);
router.get('/:slug', renderProductDetail);

module.exports = router;
