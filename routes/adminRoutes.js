const express = require('express');
const requireAdmin = require('../middleware/requireAdmin');
const admin = require('../controllers/adminController');

const router = express.Router();
router.use(requireAdmin);
router.get('/', admin.renderDashboard);
router.get('/products', admin.renderProducts);
router.get('/products/new', admin.renderNewProduct);
router.post('/products', admin.uploadProductImages, admin.createProduct);
router.get('/products/:id/edit', admin.renderEditProduct);
router.post('/products/:id', admin.uploadEditProductImages, admin.updateProduct);
router.post('/products/:id/delete', admin.deleteProduct);
router.get('/orders', admin.renderOrders);
router.get('/orders/:id', admin.renderOrder);
router.post('/orders/:id/status', admin.updateOrderStatus);
router.get('/users', admin.renderUsers);

module.exports = router;
