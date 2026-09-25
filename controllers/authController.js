const bcrypt = require('bcryptjs');
const User = require('../models/User');

function safeReturnTo(value) {
  if (typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')) return value;
  return '/account';
}

function isValidEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPassword(password) {
  return Buffer.byteLength(password, 'utf8') <= 72;
}

function regenerateSession(req, user) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) return reject(error);
      req.session.userId = String(user._id);
      req.session.userEmail = user.email;
      req.session.userName = user.name;
      req.session.userRole = user.role || 'customer';
      req.session.save((saveError) => saveError ? reject(saveError) : resolve());
    });
  });
}

function renderLogin(req, res) {
  res.render('auth/login', {
    title: 'Sign in | Maison Atelier',
    returnTo: safeReturnTo(req.query.returnTo),
    error: null,
    email: ''
  });
}

function renderRegister(req, res) {
  res.render('auth/register', {
    title: 'Create an account | Maison Atelier',
    returnTo: safeReturnTo(req.query.returnTo),
    error: null,
    name: '',
    email: ''
  });
}

async function login(req, res, next) {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const returnTo = safeReturnTo(req.body.returnTo);

  try {
    if (!isValidEmail(email) || !password || !isValidPassword(password)) {
      return res.status(422).render('auth/login', {
        title: 'Sign in | Maison Atelier', returnTo, error: 'Enter a valid email address and password.', email
      });
    }

    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).render('auth/login', {
        title: 'Sign in | Maison Atelier', returnTo, error: 'Email or password is incorrect.', email
      });
    }

    await regenerateSession(req, user);
    res.redirect(returnTo);
  } catch (error) {
    next(error);
  }
}

async function register(req, res, next) {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const returnTo = safeReturnTo(req.body.returnTo);
  const renderError = (message, status = 422) => res.status(status).render('auth/register', {
    title: 'Create an account | Maison Atelier', returnTo, error: message, name, email
  });

  if (name.length < 2 || name.length > 80) return renderError('Enter a name between 2 and 80 characters.');
  if (!isValidEmail(email)) return renderError('Enter a valid email address.');
  if (password.length < 8) return renderError('Your password must contain at least 8 characters.');
  if (!isValidPassword(password)) return renderError('Your password must be no longer than 72 bytes.');

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ name, email, passwordHash });
    await regenerateSession(req, user);
    res.redirect(returnTo);
  } catch (error) {
    if (error.code === 11000) return renderError('An account with this email already exists.', 409);
    next(error);
  }
}

async function renderAccount(req, res, next) {
  try {
    const user = await User.findById(req.session.userId).select('name email createdAt').lean();
    if (!user) {
      return req.session.destroy(() => res.redirect('/login?returnTo=%2Faccount'));
    }
    res.render('account', {
      title: 'Your account | Maison Atelier',
      user: { ...user, name: user.name || user.email.split('@')[0] }
    });
  } catch (error) {
    next(error);
  }
}

function logout(req, res, next) {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie('maison.sid', { httpOnly: true, sameSite: 'lax' });
    res.redirect('/');
  });
}

module.exports = { renderLogin, renderRegister, login, register, renderAccount, logout };
