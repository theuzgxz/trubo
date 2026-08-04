// Pricing Card Selection
function selectCard(selectedElement) {
  const cards = document.querySelectorAll('.price-card');
  cards.forEach(card => card.classList.remove('selected'));
  selectedElement.classList.add('selected');
}

// Pricing Card Selection
function selectCard(selectedElement) {
  const cards = document.querySelectorAll('.price-card');
  cards.forEach(card => card.classList.remove('selected'));
  selectedElement.classList.add('selected');
}

// ==========================================================================
// UTMIFY & TRACKING PARAMETERS LOGIC
// ==========================================================================
function captureTrackingParameters() {
  const params = new URLSearchParams(window.location.search);
  const trackingData = {
    src: params.get('src') || '',
    sck: params.get('sck') || '',
    utm_source: params.get('utm_source') || '',
    utm_medium: params.get('utm_medium') || '',
    utm_campaign: params.get('utm_campaign') || '',
    utm_content: params.get('utm_content') || '',
    utm_term: params.get('utm_term') || ''
  };

  for (const key in trackingData) {
    if (trackingData[key]) {
      localStorage.setItem(`ds_${key}`, trackingData[key]);
    } else {
      trackingData[key] = localStorage.getItem(`ds_${key}`) || '';
    }
  }
  return trackingData;
}

// Capture and save UTMs on page load (works on both index.html and checkout.html)
document.addEventListener('DOMContentLoaded', () => {
  captureTrackingParameters();
});

// ==========================================================================
// MERCADO PAGO CHECKOUT TRANSPARENTE LOGIC
// ==========================================================================

let currentOrder = {
  title: '1 pacote (48 Adesivos)',
  price: 67.90,
  pack: '1'
};

let statusPollInterval = null;
let mpInstance = null;

// Initialize Mercado Pago SDK v2
function initMercadoPagoSDK() {
  if (window.MercadoPago && !mpInstance) {
    try {
      mpInstance = new window.MercadoPago('APP_USR-5aa13fee-9d0c-47bc-8216-45239ba8b106', {
        locale: 'pt-BR'
      });
      console.log('[MercadoPago SDK] Initialized');
    } catch (e) {
      console.error('[MercadoPago SDK Error]', e);
    }
  }
}

// Meta Pixel TrackOnce Helper
function trackOnce(key, eventName, parameters = {}) {
  if (sessionStorage.getItem(key)) return;
  if (typeof window.fbq === 'function') {
    window.fbq('track', eventName, parameters);
    sessionStorage.setItem(key, 'true');
  }
}

// Redirect to Checkout Page matching Image 1
function goToCheckout() {
  const selectedCard = document.querySelector('.price-card.selected');
  const packId = selectedCard ? (selectedCard.getAttribute('data-pack') || '1') : '1';
  const packTitle = selectedCard ? (selectedCard.getAttribute('data-title') || 'Dream Sleep - Adesivo de Sono') : 'Dream Sleep - Adesivo de Sono';
  const packPrice = selectedCard ? (parseFloat(selectedCard.getAttribute('data-price')) || 109.00) : 109.00;

  trackOnce('meta_initiate_checkout', 'InitiateCheckout', {
    content_name: packTitle,
    content_type: 'product',
    currency: 'BRL',
    value: packPrice
  });

  window.location.href = `checkout.html?pack=${packId}`;
}

function closeCheckoutModal() {
  const modal = document.getElementById('mp-checkout-modal');
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
  if (statusPollInterval) {
    clearInterval(statusPollInterval);
    statusPollInterval = null;
  }
}

function resetCheckoutModal() {
  const step1 = document.getElementById('mp-step-1');
  const step2 = document.getElementById('mp-step-2');
  const result = document.getElementById('mp-checkout-result');
  const form = document.getElementById('mp-checkout-form');
  const ind1 = document.getElementById('mp-step-indicator-1');
  const ind2 = document.getElementById('mp-step-indicator-2');

  if (step1) step1.style.display = 'block';
  if (step2) step2.style.display = 'none';
  if (result) result.style.display = 'none';
  if (form) form.style.display = 'block';

  if (ind1) ind1.classList.add('active');
  if (ind2) ind2.classList.remove('active');

  selectPaymentTab('pix');
}

function proceedToPayment() {
  const form = document.getElementById('mp-checkout-form');
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const step1 = document.getElementById('mp-step-1');
  const step2 = document.getElementById('mp-step-2');
  const ind1 = document.getElementById('mp-step-indicator-1');
  const ind2 = document.getElementById('mp-step-indicator-2');

  if (step1) step1.style.display = 'none';
  if (step2) step2.style.display = 'block';
  if (ind1) ind1.classList.remove('active');
  if (ind2) ind2.classList.add('active');
}

function backToStep1() {
  const step1 = document.getElementById('mp-step-1');
  const step2 = document.getElementById('mp-step-2');
  const ind1 = document.getElementById('mp-step-indicator-1');
  const ind2 = document.getElementById('mp-step-indicator-2');

  if (step1) step1.style.display = 'block';
  if (step2) step2.style.display = 'none';
  if (ind1) ind1.classList.add('active');
  if (ind2) ind2.classList.remove('active');
}

function selectPaymentTab(tab) {
  const tabPix = document.getElementById('tab-btn-pix');
  const tabCard = document.getElementById('tab-btn-card');
  const contentPix = document.getElementById('tab-content-pix');
  const contentCard = document.getElementById('tab-content-card');

  if (tab === 'pix') {
    if (tabPix) tabPix.classList.add('active');
    if (tabCard) tabCard.classList.remove('active');
    if (contentPix) contentPix.style.display = 'block';
    if (contentCard) contentCard.style.display = 'none';
  } else {
    if (tabCard) tabCard.classList.add('active');
    if (tabPix) tabPix.classList.remove('active');
    if (contentCard) contentCard.style.display = 'block';
    if (contentPix) contentPix.style.display = 'none';
  }
}

// Calculate 1x - 12x Installments for Credit Card
function populateInstallmentOptions() {
  const select = document.getElementById('mp-card-installments');
  if (!select) return;

  const total = currentOrder.price;
  let html = '';

  for (let i = 1; i <= 12; i++) {
    const val = (total / i).toFixed(2).replace('.', ',');
    const label = i === 1 ? `1x à vista de R$ ${val}` : `${i}x de R$ ${val}`;
    html += `<option value="${i}">${label}</option>`;
  }

  select.innerHTML = html;
}

// ViaCEP Automatic Address Lookup
async function lookupViaCep(cepValue) {
  const cleanCep = cepValue.replace(/\D/g, '');
  if (cleanCep.length === 8) {
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await res.json();
      if (!data.erro) {
        if (document.getElementById('mp-street')) document.getElementById('mp-street').value = data.logradouro || '';
        if (document.getElementById('mp-neighborhood')) document.getElementById('mp-neighborhood').value = data.bairro || '';
        if (document.getElementById('mp-city')) document.getElementById('mp-city').value = data.localidade || '';
        if (document.getElementById('mp-state')) document.getElementById('mp-state').value = data.uf || '';
        if (document.getElementById('mp-number')) document.getElementById('mp-number').focus();
      }
    } catch (e) {
      console.log('ViaCEP lookup failed', e);
    }
  }
}

// Submit PIX Payment
async function submitPixPayment() {
  const btn = document.getElementById('btn-submit-pix');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="ri-loader-4-line spin"></i> Gerando PIX...';
  }

  try {
    const payload = getPayerFormData();
    payload.payment_method_id = 'pix';
    payload.transaction_amount = currentOrder.price;
    payload.description = `Dream Sleep - ${currentOrder.title}`;
    payload.tracking_parameters = captureTrackingParameters();

    const response = await fetch('/api/process-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!result.success) {
      showErrorScreen(result.error || 'Não foi possível gerar o PIX. Tente novamente.');
      return;
    }

    // Show PIX Screen
    showPixResult(result);

  } catch (error) {
    console.error('PIX payment error:', error);
    showErrorScreen('Erro de conexão ao gerar o PIX. Verifique sua internet.');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i class="ri-qr-code-line"></i> Gerar PIX para Pagar R$ ${currentOrder.price.toFixed(2).replace('.', ',')}`;
    }
  }
}

// Submit Credit Card Payment
async function submitCardPayment() {
  const btn = document.getElementById('btn-submit-card');
  const cardNumber = document.getElementById('mp-card-number').value.replace(/\s/g, '');
  const cardHolder = document.getElementById('mp-card-holder').value.trim();
  const cardExpiry = document.getElementById('mp-card-expiry').value.trim();
  const cardCvv = document.getElementById('mp-card-cvv').value.trim();
  const installments = document.getElementById('mp-card-installments').value;

  if (!cardNumber || !cardHolder || !cardExpiry || !cardCvv) {
    alert('Por favor, preencha todos os campos do cartão de crédito.');
    return;
  }

  const [month, year] = cardExpiry.split('/');
  if (!month || !year || month.length !== 2 || year.length !== 2) {
    alert('Data de vencimento inválida. Use o formato MM/AA.');
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="ri-loader-4-line spin"></i> Processando Pagamento...';
  }

  try {
    let token = null;

    // Try tokenizing card with Mercado Pago JS SDK
    if (mpInstance && mpInstance.createCardToken) {
      try {
        const fullYear = `20${year}`;
        const cardTokenResult = await mpInstance.createCardToken({
          cardNumber: cardNumber,
          cardholderName: cardHolder,
          cardExpirationMonth: month,
          cardExpirationYear: fullYear,
          securityCode: cardCvv,
          identificationType: 'CPF',
          identificationNumber: document.getElementById('mp-cpf').value.replace(/\D/g, '')
        });
        token = cardTokenResult.id;
      } catch (sdkErr) {
        console.warn('[SDK Tokenizer fallback]', sdkErr);
      }
    }

    const payload = getPayerFormData();
    payload.payment_method_id = getCardBrand(cardNumber);
    payload.transaction_amount = currentOrder.price;
    payload.description = `Dream Sleep - ${currentOrder.title}`;
    payload.installments = installments;
    payload.tracking_parameters = captureTrackingParameters();
    if (token) payload.token = token;

    const response = await fetch('/api/process-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (result.success && result.status === 'approved') {
      showSuccessScreen(result);
    } else if (result.success && result.status === 'in_process') {
      showSuccessScreen(result, 'Pagamento em análise pelo seu banco. Você receberá a confirmação em instantes.');
    } else {
      showErrorScreen(result.error || 'Cartão recusado ou dados inválidos. Verifique e tente novamente.');
    }

  } catch (error) {
    console.error('Card payment error:', error);
    showErrorScreen('Erro ao comunicar com a operadora do cartão.');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="ri-shield-check-line"></i> Pagar no Cartão de Crédito';
    }
  }
}

// Display PIX QR Code & Copia e Cola
function showPixResult(result) {
  document.getElementById('mp-checkout-form').style.display = 'none';
  const resultContainer = document.getElementById('mp-checkout-result');
  const pixBox = document.getElementById('mp-result-pix');
  const successBox = document.getElementById('mp-result-success');
  const errorBox = document.getElementById('mp-result-error');

  if (resultContainer) resultContainer.style.display = 'block';
  if (pixBox) pixBox.style.display = 'block';
  if (successBox) successBox.style.display = 'none';
  if (errorBox) errorBox.style.display = 'none';

  const img = document.getElementById('mp-qrcode-img');
  const copiaInput = document.getElementById('mp-copia-cola-text');

  if (img && result.qr_code_base64) {
    img.src = `data:image/png;base64,${result.qr_code_base64}`;
  }
  if (copiaInput && result.qr_code) {
    copiaInput.value = result.qr_code;
  }

  // Start status polling
  if (result.payment_id) {
    startStatusPolling(result.payment_id);
  }
}

// Poll payment status every 3s
function startStatusPolling(paymentId) {
  if (statusPollInterval) clearInterval(statusPollInterval);

  statusPollInterval = setInterval(async () => {
    try {
      const res = await fetch(`/api/payment-status/${paymentId}`);
      const data = await res.json();
      if (data.success && data.status === 'approved') {
        clearInterval(statusPollInterval);
        statusPollInterval = null;
        showSuccessScreen(data);
      }
    } catch (e) {
      console.log('Polling status error', e);
    }
  }, 3000);
}

// Show Success Screen
function showSuccessScreen(result, customMsg) {
  document.getElementById('mp-checkout-form').style.display = 'none';
  const resultContainer = document.getElementById('mp-checkout-result');
  const pixBox = document.getElementById('mp-result-pix');
  const successBox = document.getElementById('mp-result-success');
  const errorBox = document.getElementById('mp-result-error');

  if (resultContainer) resultContainer.style.display = 'block';
  if (pixBox) pixBox.style.display = 'none';
  if (successBox) successBox.style.display = 'block';
  if (errorBox) errorBox.style.display = 'none';

  const infoBox = document.getElementById('mp-order-summary-box');
  if (infoBox) {
    infoBox.innerHTML = `
      <strong>Código do Pedido:</strong> #${result.payment_id || 'DS-' + Date.now().toString().slice(-6)}<br>
      <strong>Item:</strong> Dream Sleep - ${currentOrder.title}<br>
      <strong>Valor Total:</strong> R$ ${currentOrder.price.toFixed(2).replace('.', ',')}<br>
      <strong>Status:</strong> Aprovado <i class="ri-checkbox-circle-line" style="color:#0dcc1c;"></i><br>
      <small style="display:block; margin-top:8px; color:#888;">${customMsg || 'Os detalhes do envio e o rastreio serão enviados para o seu e-mail.'}</small>
    `;
  }
}

// Show Error Screen
function showErrorScreen(errorMsg) {
  document.getElementById('mp-checkout-form').style.display = 'none';
  const resultContainer = document.getElementById('mp-checkout-result');
  const pixBox = document.getElementById('mp-result-pix');
  const successBox = document.getElementById('mp-result-success');
  const errorBox = document.getElementById('mp-result-error');

  if (resultContainer) resultContainer.style.display = 'block';
  if (pixBox) pixBox.style.display = 'none';
  if (successBox) successBox.style.display = 'none';
  if (errorBox) errorBox.style.display = 'block';

  const msgEl = document.getElementById('mp-error-message');
  if (msgEl) msgEl.innerText = errorMsg;
}

// Copy PIX Code Helper
function copyPixCode() {
  const input = document.getElementById('mp-copia-cola-text');
  const btn = document.getElementById('mp-copy-btn');
  if (!input || !input.value) return;

  input.select();
  navigator.clipboard.writeText(input.value);

  if (btn) {
    btn.innerHTML = '<i class="ri-check-line"></i> Copiado!';
    btn.style.background = '#10b981';
    setTimeout(() => {
      btn.innerHTML = '<i class="ri-file-copy-line"></i> Copiar Código PIX';
      btn.style.background = 'var(--accent-green)';
    }, 3000);
  }
}

// Helper: Extract form fields
function getPayerFormData() {
  const name = document.getElementById('mp-name')?.value.trim() || 'Cliente';
  const nameParts = name.split(' ');
  return {
    payer: {
      first_name: nameParts[0] || 'Cliente',
      last_name: nameParts.slice(1).join(' ') || 'DreamSleep',
      email: document.getElementById('mp-email')?.value.trim() || 'cliente@email.com',
      identification: {
        type: 'CPF',
        number: document.getElementById('mp-cpf')?.value.replace(/\D/g, '') || ''
      },
      phone: document.getElementById('mp-phone')?.value.replace(/\D/g, '') || '',
      address: {
        zip_code: document.getElementById('mp-cep')?.value.replace(/\D/g, '') || '',
        street_name: document.getElementById('mp-street')?.value || '',
        street_number: document.getElementById('mp-number')?.value || '',
        neighborhood: document.getElementById('mp-neighborhood')?.value || '',
        city: document.getElementById('mp-city')?.value || '',
        federal_unit: document.getElementById('mp-state')?.value || 'SP'
      }
    }
  };
}

// Helper: Simple card brand detection
function getCardBrand(number) {
  if (/^4/.test(number)) return 'visa';
  if (/^5[1-5]/.test(number)) return 'master';
  if (/^3[47]/.test(number)) return 'amex';
  if (/^(6011|65|64[4-9])/.test(number)) return 'elo';
  if (/^38/.test(number)) return 'hipercard';
  return 'master';
}

// Input Masks
function maskCPF(input) {
  let v = input.value.replace(/\D/g, '');
  if (v.length > 11) v = v.slice(0, 11);
  v = v.replace(/(\d{3})(\d)/, '$1.$2');
  v = v.replace(/(\d{3})(\d)/, '$1.$2');
  v = v.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  input.value = v;
}

function maskPhone(input) {
  let v = input.value.replace(/\D/g, '');
  if (v.length > 11) v = v.slice(0, 11);
  v = v.replace(/^(\d{2})(\d)/g, '($1) $2');
  v = v.replace(/(\d{5})(\d)/, '$1-$2');
  input.value = v;
}

function maskCardNumber(input) {
  let v = input.value.replace(/\D/g, '');
  if (v.length > 16) v = v.slice(0, 16);
  v = v.replace(/(\d{4})/g, '$1 ').trim();
  input.value = v;
}

function maskCardExpiry(input) {
  let v = input.value.replace(/\D/g, '');
  if (v.length > 4) v = v.slice(0, 4);
  if (v.length > 2) v = v.slice(0, 2) + '/' + v.slice(2);
  input.value = v;
}


// Subscribe Toggle
function toggleSubscribe(element) {
  const checkbox = element.querySelector('.subscribe-checkbox');
  checkbox.classList.toggle('active');
}

// FAQ Accordion Toggle
function toggleFaq(element) {
  element.classList.toggle('active');
}

// Hero Image Gallery Toggle
function changeHeroImg(thumbElement, imageUrl, index) {
  const heroImg = document.getElementById('main-hero-img');
  const counter = document.getElementById('gallery-counter');
  const thumbs = document.querySelectorAll('.gallery-thumbs .thumb');

  thumbs.forEach(t => t.classList.remove('active'));
  thumbElement.classList.add('active');

  heroImg.style.opacity = '0';

  setTimeout(() => {
    heroImg.src = imageUrl;
    heroImg.style.opacity = '1';
    if (counter) counter.innerText = `${index} / ${thumbs.length}`;
  }, 300);
}

// --- CEP / FRETE LOGIC ---

// Mascara o campo de CEP no formato 00000-000
function maskCep(input) {
  let v = input.value.replace(/\D/g, '');
  if (v.length > 5) {
    v = v.slice(0, 5) + '-' + v.slice(5, 8);
  }
  input.value = v;
}

// Retorna a data de hoje no horário de Brasília (America/Sao_Paulo)
function getBrasiliaToday() {
  const now = new Date();
  // Obtem string da data no fuso de SP para extrair dia/mes/ano corretos
  const str = now.toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  // Formato "DD/MM/YYYY"
  const parts = str.split('/');
  // Cria objeto Date local na meia-noite desse dia (sem problemas de fuso)
  return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
}

// Formata uma data como "DD Mes" (ex: "10 Jul")
function formatDate(d) {
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const day = String(d.getDate()).padStart(2, '0');
  return `${day} ${months[d.getMonth()]}`;
}

// Adiciona N dias corridos a uma data
function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

// Consulta o CEP e exibe a timeline de entrega
function consultarCep() {
  const input = document.getElementById('cep-input');
  const hint = document.getElementById('cep-hint');
  const timeline = document.getElementById('shipping-timeline-section');
  const btn = document.getElementById('cep-btn');

  const digits = (input ? input.value.replace(/\D/g, '') : '');

  // Validação: precisa de 8 dígitos
  if (digits.length < 8) {
    if (hint) hint.style.display = 'block';
    if (timeline) timeline.style.display = 'none';
    return;
  }

  if (hint) hint.style.display = 'none';

  // Feedback visual no botão
  if (btn) {
    btn.innerHTML = '<i class="ri-loader-4-line" style="animation: spin 0.8s linear infinite; display:inline-block;"></i> Calculando...';
    btn.disabled = true;
  }

  // Simula um delay de "consulta" para parecer real
  setTimeout(() => {
    // Datas com base no horário real de Brasília
    const today = getBrasiliaToday();
    const d1 = today;                  // Pedido Realizado = hoje
    const d2 = addDays(today, 1);      // Em Transporte = amanhã
    const d3Start = addDays(today, 4); // Entregue: de +4
    const d3End = addDays(today, 7);   // até +7 dias

    const etaStr = `${formatDate(d3Start)} - ${formatDate(d3End)}`;

    const elEta = document.getElementById('shipping-eta');
    const el1 = document.getElementById('shipping-date-1');
    const el2 = document.getElementById('shipping-date-2');
    const el3 = document.getElementById('shipping-date-3');

    if (elEta) elEta.innerText = etaStr;
    if (el1)   el1.innerText = formatDate(d1);
    if (el2)   el2.innerText = formatDate(d2);
    if (el3)   el3.innerText = etaStr;

    // Exibe a timeline com animação suave
    if (timeline) {
      timeline.style.display = 'block';
      timeline.style.opacity = '0';
      timeline.style.transition = 'opacity 0.4s ease';
      setTimeout(() => { timeline.style.opacity = '1'; }, 10);
    }

    // Restaura o botão
    if (btn) {
      btn.innerHTML = '<i class="ri-check-line"></i> Calculado!';
      btn.style.background = '#10b981';
      btn.disabled = false;
    }
  }, 900);
}

// Mantida por compatibilidade (não é mais chamada automaticamente)
function updateShippingDates() {}


// Efficient Scroll & Reveal Logic
function initScrollPerformance() {
  const bar = document.getElementById('sticky-buy-bar');
  const heroSection = document.querySelector('.hero-grid');
  
  if (bar && heroSection) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) {
          bar.classList.add('show');
        } else {
          bar.classList.remove('show');
        }
      });
    }, { threshold: 0 });
    
    observer.observe(heroSection);
  }
}

function scrollToHero() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function scrollToReviews() {
  const reviewsSec = document.getElementById('reviews-section');
  if (reviewsSec) {
    reviewsSec.scrollIntoView({ behavior: 'smooth' });
  }
}

// Mobile Drawer Actions
function openDrawer() {
  const drawer = document.getElementById('mobile-drawer');
  if (drawer) {
    drawer.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

function closeDrawer() {
  const drawer = document.getElementById('mobile-drawer');
  if (drawer) {
    drawer.classList.remove('active');
    document.body.style.overflow = '';
  }
}

function closeDrawerAndScroll() {
  closeDrawer();
  scrollToHero();
}

document.addEventListener('DOMContentLoaded', () => {
  updateShippingDates();
  initScrollPerformance();
  
  const menuBtn = document.getElementById('mobile-menu-btn');
  if (menuBtn) {
    menuBtn.addEventListener('click', openDrawer);
  }
});

// ==========================================
// MODAL EXPLICATIVO DO RODAPÉ (POPUP)
// ==========================================

const modalData = {
  'inicio': {
    icon: 'ri-moon-clear-line',
    title: 'Dream Sleep — O Início do Sono Profundo',
    body: `<p>Você está na página oficial do <strong>Dream Sleep</strong>, a fórmula definitiva desenvolvida para restaurar a qualidade de suas noites.</p>
           <p>Combinando nanotecnologia transdérmica com compostos 100% naturais (como Glicinato de Magnésio e L-Teanina), o Dream Sleep atua entregando os ativos diretamente em sua corrente sanguínea durante toda a noite de forma gradual. Isso significa que você pega no sono mais rápido, evita os despertares no meio da madrugada e acorda com o corpo e a mente totalmente renovados.</p>
           <p>Explore nosso site e dê o primeiro passo rumo a noites mais tranquilas e dias mais enérgicos!</p>`,
    btnText: 'Conhecer Ofertas',
    action: () => {
      closeInfoModal();
      scrollToHero();
    }
  },
  'como-funciona': {
    icon: 'ri-pulse-line',
    title: 'Como Funciona o Dream Sleep?',
    body: `<p>O Dream Sleep foi projetado para pular o sistema digestivo, oferecendo uma absorção muito mais eficiente e sustentada dos nutrientes:</p>
           <ul>
             <li><strong>Aplicação Prática:</strong> Cole o adesivo em uma região de pele limpa e sem pelos (como antebraço ou ombro) 30 minutos antes de deitar.</li>
             <li><strong>Absorção Direta (Transdérmica):</strong> Os poros absorvem os ativos naturais de forma gradual, sem sobrecarregar seu estômago ou fígado.</li>
             <li><strong>Liberação por 8 Horas:</strong> O fluxo constante dos ingredientes age durante toda a noite para garantir que você passe mais tempo na fase de sono REM profundo.</li>
           </ul>
           <p>Ao acordar, basta retirar o adesivo e descartá-lo. Você acorda sem ressaca e pronto para o dia!</p>`,
    btnText: 'Experimentar Agora',
    action: () => {
      closeInfoModal();
      scrollToHero();
    }
  },
  'ingredientes': {
    icon: 'ri-leaf-line',
    title: 'Nossos Ingredientes Naturais',
    body: `<p>Nossa fórmula combina os fitoterápicos e minerais mais potentes da ciência do sono, agindo em total sinergia:</p>
           <ul>
             <li><strong>Magnésio Glicinato:</strong> Induz o relaxamento muscular profundo e reduz espasmos de estresse.</li>
             <li><strong>L-Teanina:</strong> Aminoácido nobre que bloqueia a ação do cortisol, silenciando a mente acelerada.</li>
             <li><strong>Valeriana Selvagem:</strong> Um sedativo fitoterápico milenar de alta potência.</li>
             <li><strong>Passiflora (Flor de Maracujá):</strong> Diminui drasticamente a ansiedade e hiperatividade cerebral.</li>
             <li><strong>Lúpulo e Óleo de Lavanda:</strong> Acalmam o sistema nervoso parassimpático.</li>
           </ul>
           <p>Uma fórmula limpa, segura e 100% livre de fármacos que causam dependência.</p>`,
    btnText: 'Ver Kits Disponíveis',
    action: () => {
      closeInfoModal();
      scrollToHero();
    }
  },
  'comprar-agora': {
    icon: 'ri-shopping-cart-2-line',
    title: 'Compra Segura e Simplificada',
    body: `<p>Adquirir o Dream Sleep é prático, rápido e sem burocracia:</p>
           <ul>
             <li><strong>Tecnologia Criptografada:</strong> Nosso checkout é integrado aos maiores e mais seguros intermediadores de pagamento do Brasil, garantindo proteção de ponta a ponta dos seus dados.</li>
             <li><strong>Condições Especiais:</strong> Oferecemos kits promocionais de 1, 2 ou 3 pacotes (com descontos de até 25% e Frete Expresso Prioritário).</li>
             <li><strong>Garantia Blindada:</strong> Se não notar melhora na qualidade do seu sono após usar por até 48 dias, devolvemos todo o seu dinheiro.</li>
           </ul>`,
    btnText: 'Comprar Agora',
    action: () => {
      closeInfoModal();
      scrollToHero();
    }
  },
  'suporte': {
    icon: 'ri-customer-service-2-line',
    title: 'Suporte e Atendimento Premium',
    body: `<p>Queremos que sua jornada com o Dream Sleep seja impecável. Por isso, nosso canal de suporte está sempre ativo:</p>
           <p><strong>Canais de Atendimento:</strong> Você pode esclarecer dúvidas sobre sua entrega ou sobre o produto enviando uma mensagem no WhatsApp do suporte ou pelo nosso e-mail oficial.</p>
           <p><strong>Prazo de Resposta:</strong> Nossa equipe de especialistas em sono responde a todas as solicitações em até 24 horas úteis, de segunda a sexta-feira, das 9h às 18h.</p>`,
    btnText: 'Entendido',
    action: () => {
      closeInfoModal();
    }
  },
  'reembolso': {
    icon: 'ri-shield-check-line',
    title: 'Garantia Blindada de 48 Noites',
    body: `<p>Acreditamos tanto na ciência por trás de nossos adesivos que assumimos todo o risco da sua compra:</p>
           <p>Você tem <strong>48 noites seguidas</strong> para experimentar o Dream Sleep. Se você não adormecer mais rápido, não tiver um sono mais contínuo e revigorante, basta entrar em contato com nosso suporte.</p>
           <p>Efetuamos a devolução de 100% do valor pago à vista, sem burocracias ou questionamentos. Seu sono ou seu dinheiro de volta!</p>`,
    btnText: 'Entendido',
    action: () => {
      closeInfoModal();
    }
  },
  'termos': {
    icon: 'ri-file-text-line',
    title: 'Termos de Uso do Dream Sleep',
    body: `<p>Ao navegar em nosso portal e adquirir o Dream Sleep, você concorda com as seguintes diretrizes:</p>
           <ul>
             <li><strong>Consumo Pessoal:</strong> Os adesivos adquiridos destinam-se exclusivamente ao uso pessoal, sendo expressamente proibida a revenda comercial não autorizada.</li>
             <li><strong>Isenção de Responsabilidade Médica:</strong> O Dream Sleep é um produto natural focado no bem-estar diário e não substitui tratamentos para distúrbios de insônia crônica de cunho psiquiátrico clínico.</li>
           </ul>`,
    btnText: 'Entendido',
    action: () => {
      closeInfoModal();
    }
  },
  'currency': {
    icon: 'ri-money-dollar-circle-line',
    title: 'Seletor de Moeda e Entrega',
    body: `<p>Atualmente, a moeda oficial de cobrança do Dream Sleep é o <strong>Real Brasileiro (R$)</strong>.</p>
           <p>Nossos centros de distribuição estão localizados estrategicamente no Brasil para garantir uma entrega extremamente rápida (Sedex/Expresso). Devido a isso, realizamos cobranças e envios apenas em território nacional no momento.</p>`,
    btnText: 'Entendido',
    action: () => {
      closeInfoModal();
    }
  },
  'profile': {
    icon: 'ri-user-line',
    title: 'Sua Área de Cliente',
    body: `<p>Olá! Para manter nossa plataforma leve, segura e rápida, <strong>não utilizamos senhas ou cadastros tradicionais</strong>.</p>
           <p>O acompanhamento de seus pacotes e faturas é feito de forma totalmente automatizada:</p>
           <ul>
             <li><strong>Confirmações por E-mail:</strong> Enviamos os recibos e dados da transação para o e-mail preenchido no checkout.</li>
             <li><strong>Atualizações no WhatsApp:</strong> Você receberá alertas a cada alteração de envio diretamente em seu celular.</li>
             <li><strong>Rastreamento Simplificado:</strong> Basta usar a nossa página de Rastreio de Pedido a qualquer momento!</li>
           </ul>`,
    btnText: 'Ir para Rastreio',
    action: () => {
      closeInfoModal();
      window.location.href = 'rastreamento.html';
    }
  }
};

let activeModalAction = null;

function openInfoModal(type) {
  const modal = document.getElementById('ps-info-modal');
  const data = modalData[type];
  if (!modal || !data) return;

  const iconEl = document.getElementById('ps-modal-icon');
  if (iconEl) {
    iconEl.className = data.icon;
  }

  const titleEl = document.getElementById('ps-modal-title');
  if (titleEl) {
    titleEl.innerHTML = data.title;
  }

  const bodyEl = document.getElementById('ps-modal-body');
  if (bodyEl) {
    bodyEl.innerHTML = data.body;
  }

  const btnEl = document.getElementById('ps-modal-action-btn');
  if (btnEl) {
    btnEl.innerText = data.btnText || 'Entendido';
  }
  activeModalAction = data.action || closeInfoModal;

  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeInfoModal() {
  const modal = document.getElementById('ps-info-modal');
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
  activeModalAction = null;
}

function closeInfoModalOnOverlay(event) {
  if (event.target.id === 'ps-info-modal') {
    closeInfoModal();
  }
}

function triggerModalAction() {
  if (activeModalAction) {
    activeModalAction();
  } else {
    closeInfoModal();
  }
}

// ==========================================
// FAQ NAVEGAÇÃO DE ABAS
// ==========================================
function switchFaqTab(tabName, element) {
  const tabs = document.querySelectorAll('.q-tab');
  tabs.forEach(tab => tab.classList.remove('active'));
  element.classList.add('active');
  
  const contentProduto = document.getElementById('faq-content-produto');
  const contentFrete = document.getElementById('faq-content-frete');
  
  if (tabName === 'produto') {
    if (contentProduto) contentProduto.style.display = 'block';
    if (contentFrete) contentFrete.style.display = 'none';
  } else if (tabName === 'frete') {
    if (contentProduto) contentProduto.style.display = 'none';
    if (contentFrete) contentFrete.style.display = 'block';
  }
}

function scrollToFaq() {
  const faqSec = document.querySelector('.questions-section');
  if (faqSec) {
    faqSec.scrollIntoView({ behavior: 'smooth' });
  }
}

// ==========================================
// BUSCADOR DE DUVIDAS FAQ
// ==========================================
const faqSearchData = [
  {
    q: "Como o adesivo funciona?",
    a: "O adesivo Dream Sleep de 8 Horas colado na pele libera ingredientes naturais de forma gradual e constante durante toda a noite, te ajudando a pegar no sono mais rápido e evitar os terríveis despertares de madrugada.",
    tab: "produto"
  },
  {
    q: "Ele realmente funciona para dormir?",
    a: "Absolutamente! Nossos ingredientes foram clinicamente testados e formulados exatamente para promover o sono REM profundo, reduzindo o estresse físico.",
    tab: "produto"
  },
  {
    q: "Quantos adesivos vêm em cada pacote?",
    a: "Cada pacote contém 48 adesivos hiper-resistentes de uso único, suficientes para 48 dias de sono revigorante.",
    tab: "produto"
  },
  {
    q: "Como ele regula os picos de cortisol?",
    a: "A liberação transdérmica fornece a matéria-prima (como o Glicinato de Magnésio) que atua estabilizando a superprodução de cortisol noturno, o vilão do sono leve.",
    tab: "produto"
  },
  {
    q: "Quais são os ingredientes exatos?",
    a: "Glicinato de Magnésio, L-Teanina pura, Raiz de Valeriana, Flor de Maracujá (Passiflora), Lúpulo natural e Óleo Essencial de Lavanda. Tudo limpo e sem drogas escondidas.",
    tab: "produto"
  },
  {
    q: "Já tentei de tudo para cair no sono, por que o adesivo seria diferente?",
    a: "A diferença do adesivo é a tecnologia transdérmica contínua. Pílulas se diluem nos sucos gástricos e o efeito sobe e desce muito rápido. O nosso patch libera as ervas diretamente pelo tecido subcutâneo por até 8 horas constantes. É pura tecnologia orgânica!",
    tab: "produto"
  },
  {
    q: "Como um adesivo pendurado no meu braço pode me induzir a dormir?",
    a: "Assim como pomadas para dores atuam profundamente ao absorver, nossa malha contendo extrato das folhas potentes envia estímulos ao sistema nervoso parassimpático, baixando a sua frequência cardíaca a um ritmo perfeito para o descanso profundo.",
    tab: "produto"
  },
  {
    q: "Vai causar uma sensação de lentidão e ressaca de manhã?",
    a: "Não! Nenhum grogue! Diferente da Melatonina sintética bruta, a mistura leve de minerais como L-Teanina prepara você só para o sono. Ao acordar e descolar, você vai estar alerta como se tivesse tomado 3 xícaras de café na hora!",
    tab: "produto"
  },
  {
    q: "Qual é o prazo de entrega para minha região?",
    a: "O prazo médio de entrega para capitais e regiões metropolitanas é de 2 a 5 dias úteis após a postagem nos Correios/Transportadora. Para o interior e demais cidades, o prazo estimado é de 5 a 9 dias úteis. Você recebe o código de rastreamento por e-mail e WhatsApp logo após a expedição do seu pedido.",
    tab: "frete"
  },
  {
    q: "O frete é gratuito para todas as compras?",
    a: "Estamos com uma promoção exclusiva temporária: oferecemos Frete Grátis Expresso Prioritário para todo o Brasil em qualquer pedido contendo os kits de 2 ou 3 pacotes (96 ou 144 adesivos). Aproveite essa condição especial!",
    tab: "frete"
  },
  {
    q: "Como funciona a garantia de 48 noites?",
    a: "É muito simples: você adquire o seu Dream Sleep hoje e tem até 48 noites consecutivas para testá-lo. Se você não adormecer mais rápido e não tiver um sono mais profundo e restaurador nesse período, basta enviar um e-mail para o suporte solicitando o reembolso. Devolvemos 100% do seu dinheiro, sem questionamentos burocráticos.",
    tab: "frete"
  },
  {
    q: "A embalagem de envio é discreta?",
    a: "Sim, totalmente. Nossos pacotes são expedidos em caixas ou envelopes pardos de segurança completamente neutros. Não há nenhuma descrição externa indicando o produto, logotipo ou a palavra \"sono\", garantindo a privacidade absoluta da sua entrega.",
    tab: "frete"
  }
];

function openSearchModal() {
  const modal = document.getElementById('ps-search-modal');
  if (modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    const input = document.getElementById('faq-search-input');
    if (input) {
      input.value = '';
      input.focus();
    }
    filterSearchFaqs();
  }
}

function closeSearchModal() {
  const modal = document.getElementById('ps-search-modal');
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
}

function closeSearchModalOnOverlay(event) {
  if (event.target.id === 'ps-search-modal') {
    closeSearchModal();
  }
}

function setSearchQuery(query) {
  const input = document.getElementById('faq-search-input');
  if (input) {
    input.value = query;
    filterSearchFaqs();
  }
}

function filterSearchFaqs() {
  const input = document.getElementById('faq-search-input');
  const query = input ? input.value.trim().toLowerCase() : '';
  
  const suggestionsDiv = document.getElementById('search-suggestions');
  const resultsList = document.getElementById('search-results-list');
  const noResultsDiv = document.getElementById('search-no-results');
  
  if (!query) {
    if (suggestionsDiv) suggestionsDiv.style.display = 'block';
    if (resultsList) resultsList.style.display = 'none';
    if (noResultsDiv) noResultsDiv.style.display = 'none';
    return;
  }
  
  if (suggestionsDiv) suggestionsDiv.style.display = 'none';
  
  const matches = faqSearchData.filter(item => 
    item.q.toLowerCase().includes(query) || item.a.toLowerCase().includes(query)
  );
  
  if (matches.length > 0) {
    if (noResultsDiv) noResultsDiv.style.display = 'none';
    if (resultsList) {
      resultsList.innerHTML = matches.map(item => `
        <div class="search-result-item">
          <div class="search-result-question">${item.q}</div>
          <div class="search-result-answer">${item.a}</div>
          <div class="search-result-actions">
            <span class="search-result-goto" onclick="goToFaqItem('${item.tab}')">
              Ver na página <i class="ri-arrow-right-up-line"></i>
            </span>
          </div>
        </div>
      `).join('');
      resultsList.style.display = 'flex';
    }
  } else {
    if (resultsList) resultsList.style.display = 'none';
    if (noResultsDiv) noResultsDiv.style.display = 'block';
  }
}

function goToFaqItem(tabName) {
  closeSearchModal();
  scrollToFaq();
  
  const tabEl = document.querySelector(`.q-tab[onclick*="${tabName}"]`);
  if (tabEl) {
    switchFaqTab(tabName, tabEl);
  }
}

// Video Lightbox Modal Control
function openVideoModal() {
  const modal = document.getElementById('ps-video-modal');
  const video = document.getElementById('hero-product-video');
  if (modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    if (video) {
      video.play().catch(err => console.log('Autoplay blocked or video error:', err));
    }
  }
}

function closeVideoModal() {
  const modal = document.getElementById('ps-video-modal');
  const video = document.getElementById('hero-product-video');
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
    if (video) {
      video.pause();
    }
  }
}

function closeVideoModalOnOverlay(event) {
  if (event.target.id === 'ps-video-modal') {
    closeVideoModal();
  }
}

// Function to handle video thumbnail click in the gallery
function openVideoFromThumb(thumbElement) {
  const counter = document.getElementById('gallery-counter');
  const thumbs = document.querySelectorAll('.gallery-thumbs .thumb');
  
  thumbs.forEach(t => t.classList.remove('active'));
  thumbElement.classList.add('active');
  if (counter) {
    counter.innerText = `4 / ${thumbs.length}`;
  }

  openVideoModal();
}
