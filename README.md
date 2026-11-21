# 🏛️ Maison Atelier — Luxury Fashion E-Commerce Platform

**Maison Atelier** is an editorial, full-stack luxury fashion storefront and atelier management system. Built with Node.js, Express, EJS, and MongoDB, it features dynamic collection filtering, atomic inventory reservations, verified customer reviews, multi-tier checkout with Razorpay and Cash on Delivery, Cloudinary media delivery, and an administrative fulfillment studio.

---

## 🌟 Key Highlights & Feature Suite

### 1. 🛍️ Customer Experience & Storefront
- **Editorial Catalog Discovery:** Real-time multi-facet filtering (category, size, color, price range), keyword search, custom sorting (`newest`, `popularity`, `price-asc`, `price-desc`), and responsive pagination.
- **Product Detail & Gallery:** Multi-image carousel showcase, variant selection (sizes and colors), real-time stock alerts, and collapsible product specifications (materials, care instructions, shipping & returns).
- **Personalized Wishlist:** Persistent customer wishlist with asynchronous AJAX toggling and one-click transfer to shopping bag.
- **Verified Client Reviews:** 1–5 star rating and feedback system restricted exclusively to verified customers with confirmed orders; prevents duplicate submissions via compound indexing.

### 2. 💳 Smart Cart, Checkout & Orders
- **Interactive Shopping Bag:** Real-time quantity adjustments, live stock validation, automatic free delivery progress calculation (€500 threshold vs. €12 standard), and 20% VAT computation.
- **Dual Payment Checkout:** Streamlined delivery address capture supporting both Cash on Delivery (COD) and Online Payment via Razorpay Test Mode.
- **Resilient Payment Lifecycle:** Razorpay order creation, timing-safe HMAC-SHA256 signature verification (`verifyRazorpaySignature`), payment failure logging, and retry capabilities.
- **Order Tracking & Self-Service:** Detailed order status tracking (`pending`, `confirmed`, `processing`, `packed`, `shipped`, `delivered`, `cancelled`) with customer self-service order cancellation.

### 3. 🛡️ Administrative Fulfillment & Governance
- **Executive Operations Dashboard (`/admin`):** Centralized telemetry tracking store revenue, fulfillment breakdown, inventory alerts, and recent transactions.
- **Product Lifecycle Studio:** Complete catalog CRUD studio with automatic slugification, discount pricing, stock level controls, and direct multi-image uploads via Cloudinary CDN.
- **Order Fulfillment Pipeline:** Live status transition controls across the complete shipping lifecycle.
- **Moderation & User Governance:** Review moderation portal with soft-delete safeguards and customer account directory.

### 4. ⚡ Core Architecture & Engineering Highlights
- **Atomic Inventory Engine:** Safe stock reservation system (`reserveOrderStock`) using conditional MongoDB updates (`$inc`) and transactional rollbacks to prevent overselling.
- **Automated Stock Restoration:** Intelligent cancellation service that automatically restores deducted or reserved inventory when an order is cancelled or payment abandoned.
- **Session-Based RBAC:** Secure cookie sessions stored in MongoDB (`connect-mongo`), bcryptjs (12 rounds) salted hashing, and role-based route middleware (`customer`, `admin`).
- **Zero-Config Resilience:** Gracefully falls back to bundled sample catalog data and in-memory sessions when running without a MongoDB connection.

---

## 🛠️ Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Backend & Architecture** | Node.js, Express 4 (MVC architecture), EJS (Embedded JavaScript) |
| **Database & ODM** | MongoDB, Mongoose 8 (`mongoose`), MongoDB Atlas |
| **Session & Auth** | `express-session`, `connect-mongo` (MongoDB session store), `bcryptjs` |
| **Payment Gateway** | Razorpay Node SDK (Orders API, HMAC-SHA256 signature verification) |
| **Media & Storage** | Cloudinary v2 (`cloudinary`), Multer (Memory Storage) |
| **Frontend & Styling** | Bootstrap 5, Custom Luxury CSS (`styles.css`), Vanilla JavaScript (ES6+ Fetch API) |
| **Scripts & Seeding** | CLI Seeds (`seedProducts.js`, `seedAdmins.js`), Cloudinary Migration utility |

---

## 📁 Repository Structure

```plaintext
Samplesite/
├── config/                     # Database, session & Cloudinary CDN configurations
├── controllers/                # Admin, auth, cart, checkout, order, product, review & wishlist handlers
├── data/                       # Local offline fallback product catalog dataset
├── middleware/                 # Route guards (requireAuth, requireAdmin, notFound)
├── models/                     # Mongoose schemas (CartItem, Order, Product, Review, User)
├── public/                     # Static client assets
│   ├── css/                    # Custom bespoke luxury stylesheet
│   ├── images/                 # Editorial hero photography & product imagery
│   └── js/                     # Client scripts (cart AJAX, wishlist, Razorpay checkout)
├── routes/                     # Express routers (admin, auth, cart, checkout, orders, products, wishlist)
├── scripts/                    # Admin seeding, catalog seeding & Cloudinary image migration CLI
├── services/                   # Atomic inventory engine, order cancellation rollback & Razorpay services
├── views/                      # EJS server-rendered templates & partials
│   ├── admin/                  # Dashboard, product studio, order fulfillment & review moderation
│   ├── auth/                   # Customer login & registration views
│   └── partials/               # Reusable headers, footers, product cards & modals
├── app.js                      # Express application assembly & middleware pipeline
└── server.js                   # HTTP server bootstrap & MongoDB connection entry point 
