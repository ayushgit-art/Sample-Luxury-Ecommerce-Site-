const express = require('express');
const { renderLogin, renderRegister, login, register, renderAccount, logout } = require('../controllers/authController');
const { requireAuthPage } = require('../middleware/requireAuth');

const router = express.Router();
router.get('/login', renderLogin);
router.post('/login', login);
router.get('/register', renderRegister);
router.post('/register', register);
router.get('/account', requireAuthPage, renderAccount);
router.post('/logout', logout);

module.exports = router;
