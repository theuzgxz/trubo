/**
 * api/syncpay.js — Cliente HTTP para a API da SyncPay (Pix CashIn)
 *
 * Endpoints (conforme documentação https://syncpay.apidog.io):
 *  Auth:    POST /api/partner/v1/auth-token   → { access_token, token_type }
 *  CashIn:  POST /api/partner/v1/cash-in      → { message, pix_code, identifier }
 *  Status:  GET  /api/partner/v1/transactions/:id → status da transação
 *
 * Fluxo:
 *  1. Obter access_token com client_id + client_secret
 *  2. Usar access_token como Bearer para criar cobrança Pix
 *  3. Retornar pix_code (copia e cola) e identifier (ID da transação)
 */

const https = require('https');

const SYNCPAY_HOST = 'api.syncpayments.com.br';

// Faz uma requisição HTTPS genérica e retorna uma Promise com os dados JSON
function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : '';
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);

    const options = {
      hostname: SYNCPAY_HOST,
      port: 443,
      path,
      method,
      headers
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            const err = new Error(`SyncPay HTTP ${res.statusCode}`);
            err.status = res.statusCode;
            err.data = parsed;
            reject(err);
          }
        } catch (e) {
          reject(new Error(`SyncPay parse error (status ${res.statusCode}): ${data}`));
        }
      });
    });

    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// Obtém access_token da SyncPay usando as credenciais do ambiente
async function getAccessToken() {
  const clientId     = process.env.SYNCPAY_CLIENT_ID;
  const clientSecret = process.env.SYNCPAY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Variáveis SYNCPAY_CLIENT_ID e SYNCPAY_CLIENT_SECRET não configuradas.');
  }

  const data = await request('POST', '/api/partner/v1/auth-token', {
    client_id:     clientId,
    client_secret: clientSecret
  });

  // Retorna: { access_token: "123003123|XzrqSwIMFS2EMuHBUPa2zhyOlcQ5...", token_type: "Bearer" }
  if (!data.access_token) {
    throw new Error('SyncPay não retornou access_token: ' + JSON.stringify(data));
  }

  return data.access_token;
}

module.exports = {
  /**
   * Cria uma cobrança Pix (CashIn) na SyncPay.
   *
   * Resposta esperada:
   *   { message: "successfully submitted", pix_code: "00020126...", identifier: "uuid" }
   *
   * @param {object} params
   * @param {number}  params.amount  - Valor em reais (ex: 6.30)
   * @param {string}  params.cpf     - CPF do pagador (só números)
   * @param {string}  params.name    - Nome do pagador
   * @param {string}  params.email   - E-mail do pagador
   * @param {string}  params.phone   - Telefone do pagador (só números)
   * @returns {object} { pix_code, identifier, message }
   */
  createPixCashIn: async (params) => {
    const token = await getAccessToken();

    const payload = {
      amount:      params.amount,
      description: 'Patch Sleep - Dream Sleep',
      webhook_url: process.env.SYNCPAY_WEBHOOK_URL || '',
      client: {
        name:  params.name,
        cpf:   params.cpf,
        email: params.email,
        phone: params.phone
      }
    };

    const data = await request('POST', '/api/partner/v1/cash-in', payload, token);
    return data;
  },

  /**
   * Consulta o status de uma transação na SyncPay pelo identifier.
   * @param {string} identifier - ID retornado pelo createPixCashIn
   */
  consultTransaction: async (identifier) => {
    const token = await getAccessToken();
    return await request('GET', `/api/partner/v1/transaction/${identifier}`, null, token);
  }
};
