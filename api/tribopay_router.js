/**
 * api/tribopay_router.js — Roteador unificado POST /create-transaction para TriboPay
 */

const express = require('express');
const router = express.Router();
const tribopay = require('./tribopay');
const cart = require('./cart');
const db = require('./db');
const { validateCPF, validateEmail, validatePhone, onlyNumbers, sanitize } = require('./utils');

router.post('/create-transaction', async (req, res) => {
  try {
    const {
      payment_method,
      customer,
      productId,
      productTitle,
      totalAmount,
      shippingPrice,
      shippingType,
      card,
      tracking
    } = req.body;

    // 1. Validações básicas do cliente
    if (!customer) {
      return res.status(400).json({ error: 'Dados do cliente não fornecidos.' });
    }
    const customerErrors = validateCustomer(customer);
    if (customerErrors.length) {
      return res.status(400).json({ error: customerErrors.join(' | ') });
    }

    // 2. Validações específicas para Cartão de Crédito
    if (payment_method === 'credit_card') {
      if (!card) {
        return res.status(400).json({ error: 'Dados do cartão não fornecidos.' });
      }
      const cardErrors = validateCard(card);
      if (cardErrors.length) {
        return res.status(400).json({ error: cardErrors.join(' | ') });
      }
    }

    // 3. Monta carrinho e frete
    const total = parseInt(totalAmount, 10);
    const shipPrice = parseInt(shippingPrice, 10) || 0;
    const itemPrice = total - shipPrice;

    // Obtém o product_hash configurado na nossa api/cart.js
    const productHash = cart.PRODUCTS[productId]?.product_hash || '';

    // 4. Monta o payload base para a TriboPay exatamente conforme a documentação
    const payload = {
      amount: total,
      offer_hash: cart.OFFER_HASH || process.env.OFFER_HASH || '',
      payment_method: payment_method,
      customer: {
        name: sanitize(customer.name),
        email: sanitize(customer.email).toLowerCase(),
        phone_number: onlyNumbers(customer.phone),
        document: onlyNumbers(customer.cpf),
        street_name: sanitize(customer.street),
        number: sanitize(customer.number),
        complement: sanitize(customer.complement || ''),
        neighborhood: sanitize(customer.neighborhood),
        city: sanitize(customer.city),
        state: sanitize(customer.state).toUpperCase(),
        zip_code: onlyNumbers(customer.cep)
      },
      cart: [
        {
          product_hash: productHash,
          title: productTitle || cart.PRODUCTS[productId]?.title || 'Produto',
          price: itemPrice,
          quantity: 1,
          operation_type: 1,
          tangible: true
        }
      ],
      expire_in_days: 1,
      transaction_origin: 'api',
      tracking: {
        src: tracking?.src || '',
        utm_source: tracking?.utm_source || '',
        utm_medium: tracking?.utm_medium || '',
        utm_campaign: tracking?.utm_campaign || '',
        utm_term: tracking?.utm_term || '',
        utm_content: tracking?.utm_content || ''
      },
      postback_url: `http://${req.headers.host}/api/webhook/tribopay`
    };

    // 5. Envia para a TriboPay de acordo com o método
    if (payment_method === 'pix') {
      const result = await tribopay.createPixTransaction(payload);
      const transactionId = result.id || result.transaction_id || result.hash;
      db.setStatus(transactionId, 'pending');

      return res.json({
        success: true,
        payment_method: 'pix',
        transaction_id: transactionId,
        pix: {
          qr_code: result.pix?.pix_qr_code || result.pix?.qr_code || result.pix_qr_code || '',
          qr_code_url: result.pix?.pix_url || result.pix?.qr_code_url || '',
          copy_paste: result.pix?.pix_qr_code || result.pix?.qr_code || result.pix_qr_code || '',
          expires_at: result.pix?.expiration_date || result.expiration_date || null
        }
      });

    } else if (payment_method === 'credit_card' || payment_method === 'credit') {
      payload.card = {
        number: onlyNumbers(card.number),
        holder_name: sanitize(card.holder_name).toUpperCase(),
        exp_month: parseInt(card.expiration_month, 10),
        exp_year: parseInt(card.expiration_year, 10),
        cvv: onlyNumbers(card.cvv)
      };
      payload.installments = parseInt(card.installments, 10) || 1;

      const result = await tribopay.createCreditCardTransaction(payload);
      const transactionId = result.id || result.transaction_id || result.hash;

      if (result.status === 'paid' || result.status === 'approved' || result.success) {
        db.setStatus(transactionId, 'paid');
        return res.json({
          success: true,
          payment_method: 'credit_card',
          transaction_id: transactionId,
          status: 'approved',
          redirect: '/obrigado'
        });
      } else {
        const reason = result.refuse_reason || result.reason || result.message || 'Transação não autorizada.';
        return res.json({
          success: false,
          payment_method: 'credit_card',
          status: 'rejected',
          reason
        });
      }
    } else {
      return res.status(400).json({ error: 'Método de pagamento inválido.' });
    }

  } catch (err) {
    console.error('[TRANSACTION ERROR]', err.response?.data || err.message);
    const apiError = err.response?.data?.message || err.response?.data?.error || err.message;
    res.status(err.response?.status || 500).json({ error: apiError || 'Erro ao processar pagamento.' });
  }
});

function validateCustomer(c) {
  const errors = [];
  if (!c.name) {
    errors.push('Nome é obrigatório.');
  } else {
    const nameParts = c.name.trim().split(/\s+/);
    if (nameParts.length < 2 || nameParts[0].length < 2 || nameParts[1].length < 2) {
      errors.push('Por favor, informe nome e sobrenome.');
    }
  }
  if (!validateEmail(c.email)) errors.push('E-mail inválido.');
  if (!validatePhone(c.phone)) errors.push('Telefone inválido.');
  if (!validateCPF(c.cpf)) errors.push('CPF inválido.');
  if (!c.cep || onlyNumbers(c.cep).length !== 8) errors.push('CEP inválido.');
  if (!c.street || c.street.trim().length < 2) errors.push('Rua inválida.');
  if (!c.number || c.number.trim().length < 1) errors.push('Número inválido.');
  if (!c.neighborhood || c.neighborhood.trim().length < 2) errors.push('Bairro inválido.');
  if (!c.city || c.city.trim().length < 2) errors.push('Cidade inválida.');
  if (!c.state || c.state.trim().length !== 2) errors.push('Estado inválido.');
  return errors;
}

function validateCard(card) {
  const errors = [];
  const num = onlyNumbers(card.number || '');
  if (num.length < 13 || num.length > 19) errors.push('Número do cartão inválido.');
  if (!card.holder_name || card.holder_name.trim().length < 3) errors.push('Nome no cartão inválido.');
  if (!card.expiration_month || card.expiration_month < 1 || card.expiration_month > 12)
    errors.push('Mês de vencimento inválido.');
  const currentYear = new Date().getFullYear();
  const year4Digits = card.expiration_year < 100 ? (2000 + card.expiration_year) : card.expiration_year;
  if (!card.expiration_year || year4Digits < currentYear)
    errors.push('Ano de vencimento inválido.');
  const cvv = onlyNumbers(card.cvv || '');
  if (cvv.length < 3 || cvv.length > 4) errors.push('CVV inválido.');
  return errors;
}

module.exports = router;
