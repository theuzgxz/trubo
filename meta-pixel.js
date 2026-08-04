// meta-pixel.js

function isMetaPixelReady() {
  return typeof window !== 'undefined' && typeof window.fbq === 'function';
}

function trackMetaEvent(eventName, params = {}) {
  if (!isMetaPixelReady()) {
    console.warn(`[Meta Pixel] fbq indisponível para ${eventName}`);
    return false;
  }

  window.fbq('track', eventName, params);
  return true;
}

function trackInitiateCheckout(planId, packTitle, packPrice) {
  const sessionKey = `meta_initiate_checkout_sent_${planId}`;
  if (sessionStorage.getItem(sessionKey)) {
    console.log(`[Meta Pixel] InitiateCheckout já enviado anteriormente para o plano ${planId}`);
    return;
  }

  const success = trackMetaEvent('InitiateCheckout', {
    content_ids: [planId],
    content_name: packTitle || 'Dream Sleep',
    content_type: 'product',
    value: packPrice,
    currency: 'BRL',
    num_items: 1
  });

  if (success) {
    sessionStorage.setItem(sessionKey, '1');
    console.log('[Meta Pixel] InitiateCheckout enviado', { planId, packTitle, packPrice });
  }
}

function trackAddPaymentInfo(planId, packTitle, packPrice) {
  const sessionKey = `meta_add_payment_info_sent_${planId}`;
  if (sessionStorage.getItem(sessionKey)) {
    console.log(`[Meta Pixel] AddPaymentInfo já enviado anteriormente para o plano ${planId}`);
    return;
  }

  const success = trackMetaEvent('AddPaymentInfo', {
    content_ids: [planId],
    content_name: packTitle || 'Dream Sleep',
    content_type: 'product',
    value: packPrice,
    currency: 'BRL'
  });

  if (success) {
    sessionStorage.setItem(sessionKey, '1');
    console.log('[Meta Pixel] AddPaymentInfo enviado', { planId, packTitle, packPrice });
  }
}

function trackPurchase(paymentId, amount, productId, productTitle) {
  const purchaseKey = `meta_purchase_sent_${paymentId}`;

  if (localStorage.getItem(purchaseKey)) {
    console.log(`[Meta Pixel] Purchase já enviado anteriormente para payment_id ${paymentId}`);
    return;
  }

  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    console.warn(`[Meta Pixel] Valor inválido para Purchase: ${amount}`);
    return;
  }

  const success = trackMetaEvent('Purchase', {
    content_ids: [productId || 'default'],
    content_name: productTitle || 'Dream Sleep',
    content_type: 'product',
    value: numericAmount,
    currency: 'BRL',
    num_items: 1
  });

  if (success) {
    localStorage.setItem(purchaseKey, '1');
    console.log(`[Meta Pixel] Purchase enviado para payment_id ${paymentId}`, { amount: numericAmount, productId });
  }
}
