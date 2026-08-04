import { checkAndCreateEvent, updateEventResult, incrementRetryCount } from './db.js';

const UTMIFY_API_TOKEN = process.env.UTMIFY_API_TOKEN;
const UTMIFY_API_URL = process.env.UTMIFY_API_URL || 'https://api.utmify.com.br/api-credentials/orders';

/**
 * Formata a data para YYYY-MM-DD HH:mm:ss (Formato esperado na createdAt)
 */
export function formatUtcDate(date = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

export function mapMercadoPagoStatusToUtmify(mpStatus) {
  const map = {
    'approved': 'paid',
    'authorized': 'paid',
    'pending': 'waiting_payment',
    'in_process': 'waiting_payment',
    'in_mediation': 'waiting_payment',
    'rejected': 'refused',
    'cancelled': 'refused',
    'refunded': 'refunded',
    'charged_back': 'chargedback'
  };
  return map[mpStatus] || 'waiting_payment';
}

function cleanString(str) {
  return typeof str === 'string' && str.trim() !== '' ? str : null;
}

function getNumericOnly(str) {
  if (typeof str !== 'string') return null;
  const num = str.replace(/\D/g, '');
  return num.length > 0 ? num : null;
}

function convertToCents(value) {
  const num = Number(value);
  if (isNaN(num)) return 0;
  return Math.round(num * 100);
}

/**
 * Envia ou atualiza um pedido na UTMify integrando com PostgreSQL para persistência.
 */
export async function sendOrderToUtmify(orderData, trackingParameters = {}, clientIp = null, dbEventId = null, currentRetry = 0) {
  if (!UTMIFY_API_TOKEN) {
    console.warn('[UTMify] Token não configurado (UTMIFY_API_TOKEN). Abortando.');
    return;
  }

  const { orderId, paymentId, transactionAmount, status, customer, paymentMethod, title = '1 pacote (48 Adesivos)', productId = 'PROD_1' } = orderData;
  const utmifyStatus = mapMercadoPagoStatusToUtmify(status);
  
  const formattedMethod = ['visa', 'master', 'amex', 'elo', 'hipercard', 'credit_card'].includes(paymentMethod) ? 'credit_card' : 'pix';
  const priceInCents = convertToCents(transactionAmount);

  const payload = {
    orderId: orderId,
    platform: "DreamSleep",
    paymentMethod: formattedMethod,
    status: utmifyStatus,
    createdAt: formatUtcDate(),
    approvedDate: utmifyStatus === 'paid' ? formatUtcDate() : null,
    refundedAt: utmifyStatus === 'refunded' ? formatUtcDate() : null,
    customer: {
      name: cleanString(customer.name) || "Cliente",
      email: cleanString(customer.email) || "email@cliente.com",
      phone: getNumericOnly(customer.phone),
      document: getNumericOnly(customer.document),
      country: "BR",
      ...(clientIp ? { ip: cleanString(clientIp) } : {})
    },
    products: [
      {
        id: productId,
        name: title,
        planId: null,
        planName: null,
        quantity: 1,
        priceInCents: priceInCents
      }
    ],
    trackingParameters: {
      src: cleanString(trackingParameters.src),
      sck: cleanString(trackingParameters.sck),
      utm_source: cleanString(trackingParameters.utm_source),
      utm_campaign: cleanString(trackingParameters.utm_campaign),
      utm_medium: cleanString(trackingParameters.utm_medium),
      utm_content: cleanString(trackingParameters.utm_content),
      utm_term: cleanString(trackingParameters.utm_term)
    },
    commission: {
      totalPriceInCents: priceInCents,
      gatewayFeeInCents: 0,
      userCommissionInCents: priceInCents,
      currency: "BRL"
    },
    isTest: false
  };

  // BD: Verifica idempotência e cria registro se não houver um ID passado.
  let eventId = dbEventId;
  if (!eventId) {
    const dbCheck = await checkAndCreateEvent(orderId, paymentId, utmifyStatus, payload);
    if (!dbCheck.shouldProcess) {
      console.log(`[UTMify] Evento ${orderId} - ${utmifyStatus} já enviado com sucesso. Ignorando.`);
      return;
    }
    eventId = dbCheck.eventId;
    currentRetry = dbCheck.retryCount || 0;
  }

  try {
    console.log(`[UTMify] Enviando pedido ${orderId} (Status: ${utmifyStatus}). Tentativa: ${currentRetry + 1}`);
    
    const response = await fetch(UTMIFY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-token': UTMIFY_API_TOKEN
      },
      body: JSON.stringify(payload)
    });

    const responseBodyStr = await response.text();

    if (!response.ok) {
      console.error(`[UTMify Erro HTTP ${response.status}]`, responseBodyStr);
      
      // Erro 5xx (Temporário) - Repetir
      if (response.status >= 500 || response.status === 429) {
        throw new Error(`HTTP ${response.status} - Temporary Error`);
      } else {
        // Erro 4xx (Permanente) - Registrar e não repetir
        await updateEventResult(eventId, response.status, responseBodyStr, false);
        return;
      }
    }

    console.log(`[UTMify Sucesso] Pedido ${orderId} registrado. Resposta HTTP 200/201.`);
    await updateEventResult(eventId, response.status, responseBodyStr, true);

  } catch (error) {
    console.error(`[UTMify Erro de Requisição] Pedido ${orderId}:`, error.message);
    
    if (currentRetry < 3) {
      // Regra de atraso: 2, 5, 15 segundos
      const delays = [2000, 5000, 15000];
      const delay = delays[currentRetry];
      
      console.log(`[UTMify] Falha detectada. Retentando em ${delay/1000}s...`);
      await incrementRetryCount(eventId, 0, error.message);

      setTimeout(() => {
        sendOrderToUtmify(orderData, trackingParameters, clientIp, eventId, currentRetry + 1);
      }, delay);
    } else {
      console.error(`[UTMify] Máximo de 3 tentativas excedido para o evento ${eventId}.`);
    }
  }
}
