const express = require('express');
const router = express.Router();
const db = require('./db');
const { sanitize } = require('./utils');
const { sendConfirmationEmail } = require('./email');

router.post('/', async (req, res) => {
  try {
    const { id, status, customer } = req.body;
    
    if (!id || !status) {
      return res.status(400).json({ error: 'Payload incompleto.' });
    }

    if (status === 'paid' || status === 'approved') {
      const transactionId = sanitize(String(id));
      const tx = db.getTransaction(transactionId);
      const prevStatus = tx ? tx.status : 'pending';

      db.setStatus(transactionId, 'paid');
      console.log(`[WEBHOOK SUCCESS] Transação ${transactionId} confirmada como PAGA.`);

      if (prevStatus !== 'paid') {
        const name = tx?.customerName || customer?.name || 'Cliente';
        const email = tx?.customerEmail || customer?.email;
        const amount = tx?.amount || req.body.amount || 6790;

        if (email) {
          sendConfirmationEmail(email, name, transactionId, amount)
            .catch(err => console.error('[WEBHOOK EMAIL ERROR]', err));
        } else {
          console.warn(`[WEBHOOK WARNING] Não foi possível enviar e-mail para transação ${transactionId} porque o e-mail do cliente é desconhecido.`);
        }
      }
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('[WEBHOOK ERROR]', err.message);
    res.status(500).json({ error: 'Erro ao processar webhook.' });
  }
});

module.exports = router;
