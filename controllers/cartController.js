const mongoose = require('mongoose');
const CartItem = require('../models/CartItem');
const Product = require('../models/Product');

function validOption(value, options) {
  if (!options.length) return value === '';
  return options.includes(value);
}

function getUnitPrice(product) {
  return product.discountPrice || product.price;
}

async function getCartSummary(userId) {
  const rows = await CartItem.find({ user: userId }).populate('product', 'price discountPrice').lean();
  return rows.reduce((summary, row) => {
    if (!row.product) return summary;
    summary.cartCount += row.quantity;
    summary.subtotal += getUnitPrice(row.product) * row.quantity;
    return summary;
  }, { cartCount: 0, subtotal: 0 });
}

function getRequestedOptions(body) {
  return {
    size: typeof body.size === 'string' ? body.size.trim() : '',
    color: typeof body.color === 'string' ? body.color.trim() : '',
    quantity: Number(body.quantity)
  };
}

async function renderCart(req, res, next) {
  try {
    const cartItems = await CartItem.find({ user: req.session.userId })
      .populate('product')
      .sort({ createdAt: -1 })
      .lean();
    const availableItems = cartItems.filter((item) => item.product);
    const cartCount = availableItems.reduce((total, item) => total + item.quantity, 0);
    const subtotal = availableItems.reduce((total, item) => total + getUnitPrice(item.product) * item.quantity, 0);
    res.render('cart', {
      title: 'Your bag | Maison Atelier',
      cartItems: availableItems,
      cartCount,
      subtotal,
      formatPrice: (price) => Number(price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    });
  } catch (error) {
    next(error);
  }
}

async function getCartState(req, res, next) {
  try {
    res.json(await getCartSummary(req.session.userId));
  } catch (error) {
    next(error);
  }
}

async function addCartItem(req, res, next) {
  try {
    const product = await Product.findOne({ slug: req.params.slug }).lean();
    if (!product) return res.status(404).json({ error: 'Product not found.' });

    const options = getRequestedOptions(req.body);
    if (!Number.isInteger(options.quantity) || options.quantity < 1) {
      return res.status(422).json({ error: 'Choose a valid quantity.' });
    }
    if (!validOption(options.size, product.sizes || [])) {
      return res.status(422).json({ error: 'Choose a valid size.' });
    }
    if (!validOption(options.color, product.colors || [])) {
      return res.status(422).json({ error: 'Choose a valid color.' });
    }
    if (options.quantity > product.stock) {
      return res.status(409).json({ error: `Only ${product.stock} available.` });
    }

    const identity = {
      user: new mongoose.Types.ObjectId(req.session.userId),
      product: product._id,
      size: options.size,
      color: options.color
    };

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const existing = await CartItem.findOne(identity).lean();
      if (existing) {
        if (existing.quantity + options.quantity > product.stock) {
          return res.status(409).json({ error: `Only ${product.stock - existing.quantity} more available.` });
        }
        const updated = await CartItem.updateOne(
          { _id: existing._id, quantity: existing.quantity },
          { $inc: { quantity: options.quantity } }
        );
        if (updated.modifiedCount) {
          return res.json({ ...(await getCartSummary(req.session.userId)), addedQuantity: options.quantity });
        }
        continue;
      }

      try {
        await CartItem.create({ ...identity, quantity: options.quantity });
        return res.json({ ...(await getCartSummary(req.session.userId)), addedQuantity: options.quantity });
      } catch (error) {
        if (error.code !== 11000) throw error;
      }
    }

    return res.status(409).json({ error: 'The bag changed. Please try again.' });
  } catch (error) {
    next(error);
  }
}

async function updateCartQuantity(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.itemId)) return res.status(404).json({ error: 'Cart item not found.' });
    const quantity = Number(req.body.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) return res.status(422).json({ error: 'Choose a quantity of at least one.' });

    const item = await CartItem.findOne({ _id: req.params.itemId, user: req.session.userId }).populate('product');
    if (!item || !item.product) return res.status(404).json({ error: 'Cart item not found.' });
    if (!validOption(item.size, item.product.sizes || []) || !validOption(item.color, item.product.colors || [])) {
      return res.status(409).json({ error: 'This product option is no longer available.' });
    }
    if (quantity > item.product.stock) return res.status(409).json({ error: `Only ${item.product.stock} available.` });

    item.quantity = quantity;
    await item.save();
    res.json({ ...(await getCartSummary(req.session.userId)), quantity, unitPrice: getUnitPrice(item.product) });
  } catch (error) {
    next(error);
  }
}

async function removeCartItem(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.itemId)) return res.status(404).json({ error: 'Cart item not found.' });
    const result = await CartItem.deleteOne({ _id: req.params.itemId, user: req.session.userId });
    if (!result.deletedCount) return res.status(404).json({ error: 'Cart item not found.' });
    res.json(await getCartSummary(req.session.userId));
  } catch (error) {
    next(error);
  }
}

async function clearCart(req, res, next) {
  try {
    await CartItem.deleteMany({ user: req.session.userId });
    res.json({ cartCount: 0, subtotal: 0 });
  } catch (error) {
    next(error);
  }
}

module.exports = { renderCart, getCartState, addCartItem, updateCartQuantity, removeCartItem, clearCart };
