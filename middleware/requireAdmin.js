const User = require('../models/User');

async function requireAdmin(req, res, next) {
  if (!req.session.userId) {
    return res.redirect(`/login?returnTo=${encodeURIComponent(req.originalUrl)}`);
  }

  try {
    const user = await User.findById(req.session.userId).select('role').lean();
    if (!user) {
      return req.session.destroy(() => res.redirect('/login?returnTo=%2Fadmin'));
    }
    if (user.role !== 'admin') {
      return res.status(403).render('admin/forbidden', { title: 'Access denied | Maison Atelier' });
    }
    req.adminUserId = String(user._id);
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = requireAdmin;
