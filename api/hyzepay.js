/**
 * api/hyzepay.js - Cliente HTTP para a API da HyzePay
 */

const axios = require('axios');

const getPublicKey = () => {
  const key = process.env.HYZEPAY_PUBLIC_KEY;
  if (!key) console.warn('[HYZEPAY WARNING] HYZEPAY_PUBLIC_KEY não configurada.');
  return key || '';
};
const getSecretKey = () => {
  const key = process.env.HYZEPAY_SECRET_KEY;
  if (!key) console.warn('[HYZEPAY WARNING] HYZEPAY_SECRET_KEY não configurada.');
  return key || '';
};

const getAuthHeader = () => {
  const pub = getPublicKey().trim();
  const sec = getSecretKey().trim();
  return 'Basic ' + Buffer.from(`${pub}:${sec}`).toString('base64');
};

const client = axios.create({
  baseURL: 'https://api.hyzepay.com/v1',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  },
  timeout: 15000
});

// Interceptor para adicionar o Header de Autorização dinamicamente
client.interceptors.request.use((config) => {
  config.headers['Authorization'] = getAuthHeader();
  return config;
}, (error) => {
  return Promise.reject(error);
});

module.exports = {
  /**
   * Cria uma transação (Pix ou Cartão de Crédito)
   * @param {Object} payload 
   */
  createTransaction: async (payload) => {
    const res = await client.post('/payment-transaction/create', payload);
    return res.data;
  },

  /**
   * Consulta os dados de uma transação por ID
   * @param {String} id 
   */
  consultTransaction: async (id) => {
    const res = await client.get(`/payment-transaction/info/${id}`);
    return res.data;
  }
};
