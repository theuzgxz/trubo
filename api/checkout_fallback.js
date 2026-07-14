/**
 * api/checkout_fallback.js — Fallback endpoints para carregar produtos, frete, parcelas e status
 */

const express = require('express');
const router = express.Router();
const cart = require('./cart');
const db = require('./db');
const { sendConfirmationEmail } = require('./email');

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
  const tx = db.getTransaction(id);
  let status = tx ? tx.status : 'pending';

  if (status === 'paid' || status === 'approved') {
    return res.json({ status: 'paid' });
  }

  try {
    let isApproved = false;

    const hyzepay = require('./hyzepay');
    const result = await hyzepay.consultTransaction(id);
    if (result && result.success && result.data) {
      if (result.data.status === 'PAID') {
        isApproved = true;
        status = 'paid';
      } else {
        status = result.data.status.toLowerCase();
      }
    }

    if (isApproved) {
      db.setStatus(id, 'paid');
      
      // Envia e-mail de confirmação caso tenhamos os dados do cliente e o status anterior não fosse pago
      if (tx && tx.status !== 'paid') {
        sendConfirmationEmail(
          tx.customerEmail || '',
          tx.customerName || '',
          id,
          tx.amount || 6790
        ).catch(err => console.error('[POLLING EMAIL ERROR]', err));
      }
    }
  } catch (err) {
    console.error(`[STATUS CHECK ERROR] [hyzepay]`, err.message);
  }

  res.json({ status });
});

// GET /api/checkout/test-email
router.get('/test-email', async (req, res) => {
  const email = req.query.email;
  if (!email) {
    return res.status(400).json({ error: 'Envie o e-mail via parâmetro: ?email=seu-email@gmail.com' });
  }

  try {
    const success = await sendConfirmationEmail(
      email,
      'Cliente de Teste',
      'TEST-12345',
      700,
      true
    );

    if (success) {
      res.json({ success: true, message: `E-mail de teste enviado para ${email}. Verifique sua caixa de entrada!` });
    } else {
      res.status(500).json({ success: false, error: 'O envio falhou. Verifique se as variáveis SMTP estão corretas nos logs do Render.' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
