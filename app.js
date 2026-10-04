const path = require('path');
const express = require('express');
const homeRoutes = require('./routes/homeRoutes');
const productRoutes = require('./routes/productRoutes');
const authRoutes = require('./routes/authRoutes');
const wishlistRoutes = require('./routes/wishlistRoutes');
const cartRoutes = require('./routes/cartRoutes');
const orderRoutes = require('./routes/orderRoutes');
const checkoutRoutes = require('./routes/checkoutRoutes');
const adminRoutes = require('./routes/adminRoutes');
const createSessionMiddleware = require('./config/session');
const notFound = require('./middleware/notFound');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(createSessionMiddleware());
app.use((req, res, next) => {
	res.locals.currentUser = req.session.userId ? { email: req.session.userEmail, role: req.session.userRole } : null;
	next();
});

app.use('/', authRoutes);
app.use('/wishlist', wishlistRoutes);
app.use('/cart', cartRoutes);
app.use('/', checkoutRoutes);
app.use('/admin', adminRoutes);
app.use('/orders', orderRoutes);
app.use('/', homeRoutes);
app.use('/products', productRoutes);
app.use('/shop', (req, res) => {
	const query = new URLSearchParams(req.query).toString();
	res.redirect(`/products${query ? `?${query}` : ''}`);
});
app.use(notFound);

module.exports = app;
