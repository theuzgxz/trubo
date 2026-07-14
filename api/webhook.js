const express = require('express');
const router = express.Router();
const db = require('./db');
const { sanitize } = require('./utils');
const { sendConfirmationEmail } = require('./email');

const handleTribopayWebhook = async (req, res) => {
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
};

// Antigo endpoint de webhook (TriboPay) para compatibilidade
router.post('/', handleTribopayWebhook);
router.post('/tribopay', handleTribopayWebhook);

// Novo endpoint de webhook para HyzePay
router.post('/hyzepay', async (req, res) => {
  try {
    const { Id, Status, ExternalId, Amount, PaymentMethod } = req.body;
    
    if (!Id || !Status) {
      return res.status(400).json({ error: 'Payload incompleto.' });
    }

    console.log(`[HYZEPAY WEBHOOK] Recebido para transação ${Id} (ExternalId: ${ExternalId}). Status: ${Status}`);

    if (Status === 'PAID') {
      const transactionId = sanitize(String(Id));
      
      // Busca transação pelo ID da HyzePay ou pelo ID externo (nosso db.js armazena pela chave local)
      const tx = db.getTransaction(transactionId) || db.getTransaction(ExternalId);
      const prevStatus = tx ? tx.status : 'pending';

      db.setStatus(transactionId, 'paid');
      if (ExternalId) {
        db.setStatus(ExternalId, 'paid');
      }

      console.log(`[HYZEPAY WEBHOOK SUCCESS] Transação ${transactionId} confirmada como PAGA.`);

      if (prevStatus !== 'paid') {
        const name = tx?.customerName || 'Cliente';
        const email = tx?.customerEmail;
        // Se Amount vier do webhook, é em reais (ex: 67.90). Convertemos para centavos.
        const amountCents = tx?.amount || (Amount ? Math.round(parseFloat(Amount) * 100) : 6790);

        if (email) {
          sendConfirmationEmail(email, name, transactionId, amountCents)
            .catch(err => console.error('[WEBHOOK EMAIL ERROR]', err));
        } else {
          console.warn(`[WEBHOOK WARNING] Não foi possível enviar e-mail para transação ${transactionId} porque o e-mail do cliente é desconhecido.`);
        }
      }
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('[HYZEPAY WEBHOOK ERROR]', err.message);
    res.status(500).json({ error: 'Erro ao processar webhook.' });
  }
});

module.exports = router;
