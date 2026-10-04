const paymentPanel = document.querySelector('[data-razorpay-payment]');

if (paymentPanel) {
  const payButton = paymentPanel.querySelector('[data-pay-now]');
  const message = paymentPanel.querySelector('[data-payment-message]');
  const orderId = paymentPanel.dataset.orderId;

  const showMessage = (text) => {
    message.textContent = text;
    message.hidden = false;
  };

  const recordPaymentFailure = async () => {
    const response = await fetch(`/orders/${encodeURIComponent(orderId)}/payment-failed`, {
      method: 'POST',
      headers: { Accept: 'application/json' }
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to update the payment status.');
  };

  const loadCheckout = () => new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = resolve;
    script.onerror = () => reject(new Error('Unable to load Razorpay Checkout. Please try again.'));
    document.head.append(script);
  });

  payButton.addEventListener('click', async () => {
    payButton.disabled = true;
    message.hidden = true;

    try {
      const response = await fetch(`/orders/${encodeURIComponent(orderId)}/razorpay-order`, {
        method: 'POST',
        headers: { Accept: 'application/json' }
      });
      const paymentOrder = await response.json();
      if (!response.ok) throw new Error(paymentOrder.error || 'Unable to start payment.');
      await loadCheckout();

      const checkout = new window.Razorpay({
        key: paymentOrder.keyId,
        amount: paymentOrder.amount,
        currency: paymentOrder.currency,
        name: paymentOrder.name,
        description: paymentOrder.description,
        order_id: paymentOrder.razorpayOrderId,
        prefill: { email: paymentOrder.contactEmail },
        handler: async (payment) => {
          try {
            const verificationResponse = await fetch(`/orders/${encodeURIComponent(orderId)}/verify-payment`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
              body: JSON.stringify(payment)
            });
            const verification = await verificationResponse.json();
            if (!verificationResponse.ok) throw new Error(verification.error || 'Payment verification failed.');
            window.location.assign(verification.redirectUrl);
          } catch (error) {
            showMessage(error.message || 'Payment verification failed. Your order is not marked paid.');
            payButton.disabled = false;
          }
        },
        modal: {
          ondismiss() {
            showMessage('Payment was cancelled. Your order remains pending; you can try again.');
            payButton.disabled = false;
          }
        }
      });

      checkout.on('payment.failed', async (event) => {
        showMessage(event.error?.description || 'Payment failed. Your order remains pending; you can retry when ready.');
        try {
          await recordPaymentFailure();
        } catch (error) {
          showMessage(`${event.error?.description || 'Payment failed.'} ${error.message}`);
        }
        payButton.disabled = false;
      });
      checkout.open();
    } catch (error) {
      showMessage(error.message || 'Unable to start payment. Please try again.');
      payButton.disabled = false;
    }
  });
}
