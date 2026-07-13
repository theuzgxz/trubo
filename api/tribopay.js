/**
 * api/tribopay.js — Cliente HTTP para a API da TriboPay
 */

const axios = require('axios');

const client = axios.create({
  baseURL: 'https://api.tribopay.com.br/api/public/v1',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  },
  timeout: 15000
});

const getApiToken = () => process.env.TRIBOPAY_TOKEN || '';

module.exports = {
  createPixTransaction: async (payload) => {
    const res = await client.post(`/transactions?api_token=${getApiToken()}`, {
      ...payload,
      payment_method: 'pix'
    });
    return res.data;
  },
  createCreditCardTransaction: async (payload) => {
    const res = await client.post(`/transactions?api_token=${getApiToken()}`, {
      ...payload,
      payment_method: 'credit_card'
    });
    return res.data;
  },
  consultTransaction: async (hash) => {
    const res = await client.get(`/transactions/${hash}?api_token=${getApiToken()}`);
    return res.data;
  }
};
