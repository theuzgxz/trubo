import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { sendOrderToUtmify, mapMercadoPagoStatusToUtmify } from './services/utmify.js';
import { initDatabase } from './services/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Trust Proxy to correctly get client IP on Render
app.set('trust proxy', 1);

// Mercado Pago Credentials
const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || 'APP_USR-6971823939959675-080212-4f37a2015e0947f12085a3e3dc68aa97-367751174';
const PUBLIC_KEY = process.env.MP_PUBLIC_KEY || 'APP_USR-b9f77569-c92c-4d8c-91b8-974bd5e3cfec';
const WEBHOOK_SECRET = process.env.MERCADO_PAGO_WEBHOOK_SECRET;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Initialize Database
initDatabase();

// Endpoint to provide public key to frontend
app.get('/api/config', (req, res) => {
  res.json({ publicKey: PUBLIC_KEY });
});

// Create Payment Endpoint (PIX & Credit Card)
app.post('/api/process-payment', async (req, res) => {
  try {
    const {
      transaction_amount,
      description,
      payment_method_id,
      token,
      installments,
      issuer_id,
      payer,
      tracking_parameters
    } = req.body;

    console.log(`[MercadoPago] Processing ${payment_method_id} payment of R$ ${transaction_amount}`);

    // Build payload according to Mercado Pago Official Checkout API Docs
    const amount = Number(Number(transaction_amount).toFixed(2));

    const body = {
      transaction_amount: amount,
      description: description || 'Dream Sleep - Adesivos de Sono Profundo',
      payment_method_id: payment_method_id,
      payer: {
        email: payer.email,
        first_name: payer.first_name || payer.name?.split(' ')[0] || 'Cliente',
        last_name: payer.last_name || payer.name?.split(' ').slice(1).join(' ') || 'DreamSleep',
        identification: {
          type: payer.identification?.type || 'CPF',
          number: payer.identification?.number?.replace(/\D/g, '') || '00000000000'
        }
      }
    };

    // If Credit Card, attach token, installments and optional issuer_id
    if (token) {
      body.token = token;
      body.installments = Number(installments) || 1;
      if (issuer_id) body.issuer_id = issuer_id;
    }

    // Add address if provided
    if (payer.address) {
      body.payer.address = {
        zip_code: payer.address.zip_code?.replace(/\D/g, '') || '',
        street_name: payer.address.street_name || '',
        street_number: payer.address.street_number || '',
        neighborhood: payer.address.neighborhood || '',
        city: payer.address.city || '',
        federal_unit: payer.address.federal_unit || 'SP'
      };
    }

    // Unique Idempotency key per request
    const orderId = `DS-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const idempotencyKey = orderId;

    // Attach orderId to Mercado Pago payload
    body.external_reference = orderId;
    body.metadata = {
      order_id: orderId,
      src: tracking_parameters?.src || '',
      sck: tracking_parameters?.sck || '',
      utm_source: tracking_parameters?.utm_source || '',
      utm_campaign: tracking_parameters?.utm_campaign || '',
      utm_medium: tracking_parameters?.utm_medium || '',
      utm_content: tracking_parameters?.utm_content || '',
      utm_term: tracking_parameters?.utm_term || ''
    };

    const mpResponse = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idempotencyKey
      },
      body: JSON.stringify(body)
    });

    const data = await mpResponse.json();

    if (!mpResponse.ok) {
      console.error('[MercadoPago API Error]', data);

      let userErrorMessage = data.message || 'Erro ao processar pagamento com o Mercado Pago';

      // Check if error is due to unactivated live credentials (code 7)
      if (data.message?.includes('Unauthorized') || data.cause?.[0]?.code === 7) {
        userErrorMessage = 'As credenciais de produção (APP_USR-) precisam ter a conta ativada no painel do Mercado Pago para processar cobranças reais. Para realizar testes, utilize as Credenciais de Teste (TEST-).';
      } else if (data.cause && data.cause.length > 0) {
        userErrorMessage = data.cause.map(c => c.description || c.code).join(' | ');
      }

      return res.status(mpResponse.status).json({
        success: false,
        error: userErrorMessage,
        details: data.cause || data
      });
    }

    console.log(`[MercadoPago Success] Payment ID: ${data.id}, Status: ${data.status}`);

    // Get Client IP
    const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    // Send initial status to UTMify
    const orderData = {
      orderId: orderId,
      paymentId: data.id,
      transactionAmount: amount,
      status: data.status,
      paymentMethod: payment_method_id,
      customer: {
        name: `${payer.first_name || ''} ${payer.last_name || ''}`.trim(),
        email: payer.email,
        phone: payer.phone || payer.identification?.number || '',
        document: payer.identification?.number || ''
      }
    };
    // Do not block the request, fire and forget
    sendOrderToUtmify(orderData, tracking_parameters || {}, clientIp).catch(e => console.error('[UTMify Async Error]', e));

    // Return structured response
    if (payment_method_id === 'pix') {
      const poi = data.point_of_interaction?.transaction_data;
      return res.json({
        success: true,
        payment_id: data.id,
        status: data.status,
        payment_method: 'pix',
        qr_code: poi?.qr_code,
        qr_code_base64: poi?.qr_code_base64,
        ticket_url: poi?.ticket_url
      });
    } else {
      return res.json({
        success: true,
        payment_id: data.id,
        status: data.status,
        status_detail: data.status_detail,
        payment_method: payment_method_id
      });
    }

  } catch (error) {
    console.error('[Server Error]', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno no servidor ao conectar com o Mercado Pago.'
    });
  }
});

// Payment Status Check Endpoint (for PIX polling)
app.get('/api/payment-status/:id', async (req, res) => {
  try {
    const paymentId = req.params.id;
    const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`
      }
    });

    const data = await mpResponse.json();
    if (!mpResponse.ok) {
      return res.status(mpResponse.status).json({ success: false, error: data.message });
    }

    res.json({
      success: true,
      id: data.id,
      status: data.status, // approved, pending, in_process, rejected
      status_detail: data.status_detail
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Webhook endpoint for Mercado Pago notifications
app.post('/api/webhook', async (req, res) => {
  try {
    const body = req.body || {};
    const query = req.query || {};

    const type = body.type || body.action || query.topic || query.type;
    const entityId = query['data.id'] || body.data?.id || query.id || body.id;

    if (query['data.id'] && body.data?.id && String(query['data.id']) !== String(body.data.id)) {
      console.warn(`[Webhook Sec] Discrepância de IDs detectada. Query ID: ${query['data.id']}, Body ID: ${body.data.id}`);
    }

    // --- MERCADO PAGO SIGNATURE VALIDATION ---
    if (WEBHOOK_SECRET) {
      const signatureHeader = req.headers['x-signature'];
      const requestId = req.headers['x-request-id'];

      if (!signatureHeader || !requestId) {
        console.warn(`[Webhook Sec] Missing signature headers for ID ${entityId}`);
        return res.status(401).send('Unauthorized');
      }

      const parts = signatureHeader.split(',');
      let ts = '';
      let v1 = '';
      parts.forEach(p => {
        const [k, v] = p.trim().split('=');
        if (k === 'ts') ts = v;
        if (k === 'v1') v1 = v;
      });

      // Manifest format: id:[data.id_url_parameter];request-id:[x-request-id_header];ts:[ts_header];
      const manifest = `id:${entityId};request-id:${requestId};ts:${ts};`;
      const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET).update(manifest).digest('hex');

      try {
        const expectedBuffer = Buffer.from(v1, 'hex');
        const calculatedBuffer = Buffer.from(hmac, 'hex');

        if (expectedBuffer.length !== calculatedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, calculatedBuffer)) {
          console.warn(`[Webhook Sec] Invalid signature for ID ${entityId}`);
          return res.status(401).send('Unauthorized');
        }
      } catch (e) {
        console.warn(`[Webhook Sec] Error comparing signature for ID ${entityId}`);
        return res.status(401).send('Unauthorized');
      }
    }

    console.log(`[Webhook Notificação Recebida] Tipo: ${type}, ID: ${entityId}`);

    if ((type === 'payment' || type === 'payment.updated') && entityId) {
      try {
        const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${entityId}`, {
          headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` }
        });
        const paymentInfo = await mpResponse.json();
        
        if (mpResponse.ok) {
          console.log(`[Webhook Status do Pagamento ${entityId}] Status: ${paymentInfo.status}, Status Detail: ${paymentInfo.status_detail}`);
          
          const orderId = paymentInfo.external_reference || paymentInfo.metadata?.order_id;
          
          if (orderId) {
            const currentStatus = paymentInfo.status;
            
            const orderData = {
              orderId: orderId,
              paymentId: entityId,
              transactionAmount: paymentInfo.transaction_amount,
              status: currentStatus,
              paymentMethod: paymentInfo.payment_method_id,
              customer: {
                name: `${paymentInfo.payer?.first_name || ''} ${paymentInfo.payer?.last_name || ''}`.trim(),
                email: paymentInfo.payer?.email || '',
                document: paymentInfo.payer?.identification?.number || ''
              }
            };
            
            // For webhook we might not have client IP
            const clientIp = ''; 

            // Metadata may have tracking info we passed during creation
            const trackingParameters = paymentInfo.metadata || {};

            // Async call - it uses DB internally for idempotency
            sendOrderToUtmify(orderData, trackingParameters, clientIp).catch(err => console.error('[Webhook UTMify Sync Error]', err));
            
          } else {
             console.log(`[Webhook] Pedido ${entityId} sem external_reference/metadata. Ignorando envio para UTMify.`);
          }
        }
      } catch (err) {
        console.error('[Webhook Payment Fetch Error]', err);
      }
    }

    // Always respond 200 OK quickly to Mercado Pago
    res.status(200).send('OK');
  } catch (error) {
    console.error('[Webhook Error]', error);
    res.status(200).send('OK');
  }
});

// Checkout page route
app.get('/checkout', (req, res) => {
  res.sendFile(path.join(__dirname, 'checkout.html'));
});

// Fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`================================================`);
  console.log(`🚀 Servidor Dream Sleep com Mercado Pago Ativo!`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log(`================================================`);
});
