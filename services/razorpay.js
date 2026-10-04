const crypto = require('node:crypto');
const Razorpay = require('razorpay');

const PAYMENT_CURRENCY = 'EUR';

function getRazorpayCredentials() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    const error = new Error('Razorpay Test Mode credentials are not configured.');
    error.code = 'PAYMENT_NOT_CONFIGURED';
    throw error;
  }
  if (!keyId.startsWith('rzp_test_')) {
    const error = new Error('Razorpay must use Test Mode credentials.');
    error.code = 'PAYMENT_NOT_CONFIGURED';
    throw error;
  }
  return { keyId, keySecret };
}

async function createRazorpayOrder(order) {
  const { keyId, keySecret } = getRazorpayCredentials();
  const amount = Math.round(Number(order.total) * 100);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error('The saved order total is not a valid Razorpay amount.');
  }

  const client = new Razorpay({ key_id: keyId, key_secret: keySecret });
  const razorpayOrder = await client.orders.create({
    amount,
    currency: PAYMENT_CURRENCY,
    receipt: String(order._id)
  });
  if (razorpayOrder.amount !== amount || razorpayOrder.currency !== PAYMENT_CURRENCY) {
    throw new Error('Razorpay returned an order that does not match the saved order total.');
  }
  return { keyId, amount, currency: PAYMENT_CURRENCY, razorpayOrder };
}

function getExistingRazorpayOrder(order) {
  const { keyId } = getRazorpayCredentials();
  const amount = Math.round(Number(order.total) * 100);
  if (!Number.isSafeInteger(amount) || amount <= 0 || !order.razorpayOrderId) {
    throw new Error('The saved order does not have a valid Razorpay order.');
  }
  return { keyId, amount, currency: PAYMENT_CURRENCY, razorpayOrderId: order.razorpayOrderId };
}

function verifyRazorpaySignature({ orderId, paymentId, signature }) {
  const { keySecret } = getRazorpayCredentials();
  if (typeof orderId !== 'string' || typeof paymentId !== 'string'
    || typeof signature !== 'string' || !/^[a-f0-9]{64}$/i.test(signature)) return false;

  const expected = crypto.createHmac('sha256', keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest();
  const received = Buffer.from(signature, 'hex');
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

module.exports = { createRazorpayOrder, getExistingRazorpayOrder, verifyRazorpaySignature };
