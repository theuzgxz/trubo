/**
 * api/checkout_fallback.js — Fallback endpoints para carregar produtos, frete, parcelas e status
 */

const express = require('express');
const router = express.Router();
const cart = require('./cart');
const db = require('./db');

// GET /api/checkout/products
router.get('/products', (req, res) => {
  res.json({
    products: Object.values(cart.PRODUCTS)
  });
});

// GET /api/checkout/shipping
router.get('/shipping', (req, res) => {
  res.json({
    shipping: [
      { type: 'free', label: 'Entrega Padrão', price: 0 },
      { type: 'express', label: 'Transportadora Expressa', price: 1400 }
    ]
  });
});

// GET /api/checkout/installments
router.get('/installments', (req, res) => {
  const amountCents = parseInt(req.query.amount, 10) || 6790;
  
  // Gera 12 parcelas locais simples com juros de 1.99% a.m. ou parcelamento padrão
  const installments = [];
  for (let i = 1; i <= 12; i++) {
    let value = amountCents;
    if (i > 1) {
      // Simulação simples com juros
      value = Math.round((amountCents * (1 + 0.0199 * i)) / i);
    }
    const label = `${i}x de R$ ${(value / 100).toFixed(2)} sem juros`;
    installments.push({
      installments: i,
      value,
      label
    });
  }

  res.json({ installments });
});

// GET /api/checkout/status/:id
router.get('/status/:id', async (req, res) => {
  const id = req.params.id;
  let status = db.getStatus(id);

  if (status === 'paid' || status === 'approved') {
    return res.json({ status: 'paid' });
  }

  try {
    const tribopay = require('./tribopay');
    const result = await tribopay.consultTransaction(id);
    if (result && (result.status === 'paid' || result.status === 'approved')) {
      db.setStatus(id, 'paid');
      status = 'paid';
    } else if (result && result.status) {
      status = result.status;
    }
  } catch (err) {
    console.error('[STATUS FALLBACK ERROR]', err.message);
  }

  res.json({ status });
});

module.exports = router;
