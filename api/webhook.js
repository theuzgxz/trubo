/**
 * api/webhook.js — Endpoint de recebimento de webhook da TriboPay
 */

const express = require('express');
const router = express.Router();
const db = require('./db');
const { sanitize } = require('./utils');

router.post('/', (req, res) => {
  try {
    const { id, status, customer } = req.body;
    
    if (!id || !status) {
      return res.status(400).json({ error: 'Payload incompleto.' });
    }

    if (status === 'paid' || status === 'approved') {
      const transactionId = sanitize(String(id));
      db.setStatus(transactionId, 'paid');
      console.log(`[WEBHOOK SUCCESS] Transação ${transactionId} confirmada como PAGA.`);
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('[WEBHOOK ERROR]', err.message);
    res.status(500).json({ error: 'Erro ao processar webhook.' });
  }
});

module.exports = router;
