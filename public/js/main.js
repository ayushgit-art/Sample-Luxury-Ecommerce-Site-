const bagCountElement = document.querySelector('[data-bag-count]');
const storedBagCount = Number(window.localStorage.getItem('ma-bag-count')) || 0;
const isAuthenticated = document.body.dataset.authenticated === 'true';

function updateBagCount(count) {
  if (bagCountElement) bagCountElement.textContent = String(count);
}

function announceCartStatus(message) {
  const status = document.querySelector('[data-cart-status]');
  if (!status) return;
  status.textContent = message;
  status.classList.add('is-visible');
  window.setTimeout(() => status.classList.remove('is-visible'), 2600);
}

if (isAuthenticated) {
  fetch('/cart/state', { headers: { Accept: 'application/json' } })
    .then((response) => response.json())
    .then((state) => updateBagCount(state.cartCount || 0))
    .catch(() => updateBagCount(0));
} else {
  updateBagCount(storedBagCount);
}

document.querySelectorAll('[data-add-to-cart]').forEach((button) => {
  button.addEventListener('click', () => {
    const quantityInput = button.closest('.purchase-controls')?.querySelector('[data-quantity]');
    const quantity = Math.max(1, Number(quantityInput?.value) || 1);
    const finishAdd = (count) => {
      updateBagCount(count);
      button.classList.add('is-added');
      announceCartStatus('Added to your bag.');
      window.setTimeout(() => button.classList.remove('is-added'), 1100);
    };

    if (!isAuthenticated) {
      const nextCount = (Number(window.localStorage.getItem('ma-bag-count')) || 0) + quantity;
      window.localStorage.setItem('ma-bag-count', String(nextCount));
      finishAdd(nextCount);
      return;
    }

    const size = document.querySelector('input[name="size"]:checked')?.value || '';
    const color = document.querySelector('[data-select-color].is-selected')?.dataset.selectColor || '';
    button.disabled = true;
    fetch(`/cart/items/${encodeURIComponent(button.dataset.addToCart)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ size, color, quantity })
    }).then(async (response) => {
      if (response.redirected) {
        window.location.assign(response.url);
        return null;
      }
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to add this piece.');
      finishAdd(result.cartCount);
      return result;
    }).catch((error) => announceCartStatus(error.message)).finally(() => {
      button.disabled = false;
    });
  });
});

const cartPage = document.querySelector('[data-cart-page]');
if (cartPage) {
  const money = (amount) => `€${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const sendCartRequest = async (url, method, body) => {
    const options = { method, headers: { Accept: 'application/json' } };
    if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    const response = await fetch(url, options);
    if (response.redirected) {
      window.location.assign(response.url);
      throw new Error('Please sign in to manage your bag.');
    }
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to update your bag.');
    return result;
  };

  const refreshSummary = (result) => {
    updateBagCount(result.cartCount);
    const subtotal = money(result.subtotal);
    cartPage.querySelectorAll('[data-cart-subtotal], [data-cart-total]').forEach((element) => {
      element.textContent = subtotal;
    });
    const itemCount = cartPage.querySelector('[data-cart-item-count]');
    if (itemCount) itemCount.textContent = String(result.cartCount);
  };

  cartPage.querySelectorAll('[data-cart-line]').forEach((line) => {
    const quantityInput = line.querySelector('[data-cart-quantity]');
    const itemId = line.dataset.itemId;
    let pending = false;

    const updateQuantity = async (quantity) => {
      if (pending) return;
      pending = true;
      try {
        const result = await sendCartRequest(`/cart/items/${encodeURIComponent(itemId)}`, 'PATCH', { quantity });
        quantityInput.value = String(result.quantity);
        line.querySelector('[data-line-total]').textContent = money(result.unitPrice * result.quantity);
        line.querySelectorAll('[data-cart-quantity-step]').forEach((button) => {
          button.disabled = button.dataset.cartQuantityStep === '-1'
            ? result.quantity <= 1
            : result.quantity >= Number(quantityInput.max);
        });
        refreshSummary(result);
      } catch (error) {
        announceCartStatus(error.message);
      } finally {
        pending = false;
      }
    };

    line.querySelectorAll('[data-cart-quantity-step]').forEach((button) => {
      button.addEventListener('click', () => {
        const next = Number(quantityInput.value) + Number(button.dataset.cartQuantityStep);
        updateQuantity(Math.max(1, Math.min(Number(quantityInput.max), next)));
      });
    });
    quantityInput.addEventListener('change', () => {
      const next = Math.max(1, Math.min(Number(quantityInput.max), Number(quantityInput.value) || 1));
      quantityInput.value = String(next);
      updateQuantity(next);
    });
    line.querySelector('[data-cart-remove]').addEventListener('click', async () => {
      try {
        await sendCartRequest(`/cart/items/${encodeURIComponent(itemId)}`, 'DELETE');
        window.location.reload();
      } catch (error) {
        announceCartStatus(error.message);
      }
    });
  });

  cartPage.querySelector('[data-cart-clear]')?.addEventListener('click', async () => {
    try {
      await sendCartRequest('/cart/items', 'DELETE');
      window.location.reload();
    } catch (error) {
      announceCartStatus(error.message);
    }
  });
}

function applyWishlistState(slugs) {
  document.querySelectorAll('[data-wishlist]').forEach((button) => {
    const isSaved = slugs.includes(button.dataset.wishlist);
    const productName = button.dataset.wishlist.replaceAll('-', ' ');
    button.classList.toggle('is-saved', isSaved);
    button.setAttribute('aria-pressed', String(isSaved));
    button.setAttribute('aria-label', `${isSaved ? 'Remove' : 'Add'} ${productName} ${isSaved ? 'from' : 'to'} wishlist`);
    const icon = button.querySelector('i');
    if (icon) icon.className = isSaved ? 'bi bi-heart-fill' : 'bi bi-heart';
  });
}

function announceWishlistStatus(message) {
  const status = document.querySelector('[data-wishlist-status]');
  if (!status) return;
  status.textContent = message;
  status.classList.add('is-visible');
  window.setTimeout(() => status.classList.remove('is-visible'), 2400);
}

const wishlistButtons = document.querySelectorAll('[data-wishlist]');
if (wishlistButtons.length) {
  fetch('/wishlist/state', { headers: { Accept: 'application/json' } })
    .then((response) => response.json())
    .then((state) => applyWishlistState(state.slugs || []))
    .catch(() => {});

  wishlistButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      const slug = button.dataset.wishlist;
      const wasSaved = button.getAttribute('aria-pressed') === 'true';
      button.disabled = true;
      try {
        const response = await fetch(`/wishlist/items/${encodeURIComponent(slug)}`, {
          method: wasSaved ? 'DELETE' : 'POST',
          headers: { Accept: 'application/json' }
        });
        const result = await response.json();
        if (response.status === 401 && result.loginUrl) {
          window.location.assign(result.loginUrl);
          return;
        }
        if (!response.ok) throw new Error(result.error || 'Unable to update wishlist.');
        applyWishlistState(result.slugs || []);
        announceWishlistStatus(result.saved ? 'Added to your wishlist.' : 'Removed from your wishlist.');
        if (!result.saved && document.querySelector('[data-wishlist-page]')) window.location.reload();
      } catch (_error) {
        announceWishlistStatus('Your wishlist could not be updated. Please try again.');
      } finally {
        button.disabled = false;
      }
    });
  });
}

const quickViewModal = document.querySelector('#quickViewModal');
if (quickViewModal) {
  quickViewModal.addEventListener('show.bs.modal', (event) => {
    const trigger = event.relatedTarget;
    if (!trigger) return;
    quickViewModal.querySelector('[data-quick-view-image]').src = trigger.dataset.image;
    quickViewModal.querySelector('[data-quick-view-image]').alt = trigger.dataset.name;
    quickViewModal.querySelector('[data-quick-view-name]').textContent = trigger.dataset.name;
    quickViewModal.querySelector('[data-quick-view-category]').textContent = trigger.dataset.category;
    quickViewModal.querySelector('[data-quick-view-price]').textContent = `€${Number(trigger.dataset.price).toLocaleString('en-US')}`;
    quickViewModal.querySelector('[data-quick-view-description]').textContent = trigger.dataset.description;
    quickViewModal.querySelector('[data-quick-view-link]').href = trigger.dataset.url;
  });
}

const mainProductImage = document.querySelector('#mainProductImage');
document.querySelectorAll('[data-product-image]').forEach((thumbnail) => {
  thumbnail.addEventListener('click', () => {
    if (mainProductImage) mainProductImage.src = thumbnail.dataset.productImage;
    document.querySelectorAll('[data-product-image]').forEach((item) => {
      item.classList.toggle('is-active', item === thumbnail);
      item.setAttribute('aria-pressed', String(item === thumbnail));
    });
  });
});

document.querySelectorAll('[data-select-color]').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('[data-select-color]').forEach((item) => {
      item.classList.toggle('is-selected', item === button);
      item.setAttribute('aria-pressed', String(item === button));
    });
    const selectedColor = document.querySelector('[data-selected-color]');
    if (selectedColor) selectedColor.textContent = button.dataset.selectColor;
  });
});

document.querySelectorAll('[data-quantity-step]').forEach((button) => {
  button.addEventListener('click', () => {
    const input = button.closest('.quantity-control')?.querySelector('[data-quantity]');
    if (!input) return;
    const nextQuantity = Number(input.value) + Number(button.dataset.quantityStep);
    input.value = String(Math.max(Number(input.min) || 1, Math.min(Number(input.max) || 99, nextQuantity)));
  });
});

document.querySelectorAll('[data-newsletter-form]').forEach((newsletterForm) => {
  newsletterForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const message = newsletterForm.parentElement.querySelector('[data-newsletter-message]') || document.querySelector('[data-newsletter-message]');
    if (message) message.textContent = 'Thank you. You are on the list.';
    newsletterForm.reset();
  });
});

document.querySelectorAll('[data-confirm-delete]').forEach((form) => {
  form.addEventListener('submit', (event) => {
    if (!window.confirm('Delete this product? This cannot be undone.')) event.preventDefault();
  });
});

const revealItems = document.querySelectorAll('[data-reveal]');
if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.documentElement.classList.add('motion-enabled');
  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -30px 0px' });
  revealItems.forEach((item) => revealObserver.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add('is-visible'));
}
