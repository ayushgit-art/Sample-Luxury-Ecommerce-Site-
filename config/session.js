const session = require('express-session');
const { MongoStore } = require('connect-mongo');

function createSessionMiddleware() {
  if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET must be set in production.');
  }

  return session({
    name: 'maison.sid',
    secret: process.env.SESSION_SECRET || 'maison-atelier-local-session-secret',
    resave: false,
    saveUninitialized: false,
    store: process.env.MONGODB_URI
      ? new MongoStore({ mongoUrl: process.env.MONGODB_URI, collectionName: 'sessions' })
      : undefined,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000
    }
  });
}

module.exports = createSessionMiddleware;
