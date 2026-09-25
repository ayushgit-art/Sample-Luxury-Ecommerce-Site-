# Maison Atelier

An original luxury fashion storefront foundation built with Node.js, Express, EJS, Bootstrap 5, vanilla JavaScript and Mongoose. Product and campaign photography currently use remote Unsplash placeholders; replace these with licensed brand photography before launch.

## Getting started

1. Install Node.js 18 or newer.
2. Install dependencies with `npm install`.
3. Start the preview using `npm run dev` or `npm start`.
4. Open `http://localhost:3000`.

The site runs without MongoDB and displays local sample catalog data. To connect MongoDB, copy `.env.example` to `.env`, set `MONGODB_URI`, and restart. The connection is initialized in `config/database.js`; the initial catalog is intentionally local placeholder content.

## Routes

- `/` editorial homepage
- `/products` MongoDB-backed collection with a local preview fallback
- `/products?category=Shoes&minPrice=500&size=38&sort=price-asc` filtered collection
- `/products/sculpted-leather-mule` slug-based product detail
- `/wishlist` signed-in customer's saved products
- `/login`, `/register`, and protected `/account` page for account information
- `/shop` redirects to `/products` for compatibility

After configuring `MONGODB_URI`, run `npm run seed` to insert the sample catalog without replacing existing products. The collection route queries Mongoose for category, size, color, price and search filters, sort order, and pagination.

## Structure

- `app.js`, `server.js`: Express setup and server startup
- `routes/`, `controllers/`: request routing and page rendering
- `models/`: Mongoose schemas
- `data/`: local sample product catalog
- `views/`: EJS pages and reusable partials
- `public/css/`, `public/js/`: custom responsive styling and browser interactions
- `config/`, `middleware/`: database connection and 404 handling

The wishlist is stored per account in MongoDB, with sessions also stored in MongoDB. Passwords are hashed before storage. Set a strong `SESSION_SECRET` in production. The shopping bag and newsletter confirmation are frontend demonstrations only; checkout, payments, inventory management, reviews, and newsletter storage are not connected yet.
