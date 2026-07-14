/**
 * api/hyzepay_router.js - Roteador unificado para criação de transações via HyzePay
 */

const express = require('express');
const router = express.Router();
const hyzepay = require('./hyzepay');
const cart = require('./cart');
const db = require('./db');
const { validateCPF, validateEmail, validatePhone, onlyNumbers, sanitize } = require('./utils');
const { sendConfirmationEmail } = require('./email');

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

    // 3. Monta valores
    const total = parseInt(totalAmount, 10);
    const shipPrice = parseInt(shippingPrice, 10) || 0;
    const itemPrice = total - shipPrice;
    const productHash = cart.PRODUCTS[productId]?.product_hash || 'c4amzxuvt8';

    // 4. Monta o payload para a HyzePay
    const payload = {
      amount: total,
      payment_method: payment_method === 'pix' ? 'pix' : 'credit_card',
      customer: {
        name: sanitize(customer.name),
        email: sanitize(customer.email).toLowerCase(),
        phone: onlyNumbers(customer.phone),
        document: {
          number: onlyNumbers(customer.cpf),
          type: 'cpf'
        }
      },
      items: [
        {
          title: productTitle || cart.PRODUCTS[productId]?.title || 'Adesivos Dream Sleep',
          unit_price: total, // Na HyzePay colocamos o total correspondente ou itemPrice
          quantity: 1
        }
      ],
      metadata: {
        source: 'checkout',
        product_id: productId,
        product_hash: productHash,
        utm_source: tracking?.utm_source || '',
        utm_medium: tracking?.utm_medium || '',
        utm_campaign: tracking?.utm_campaign || '',
        utm_content: tracking?.utm_content || '',
        utm_term: tracking?.utm_term || '',
        src: tracking?.src || ''
      },
      postback_url: `https://${req.headers.host}/api/webhook/hyzepay`
    };

    // Caso seja cartão, anexa o objeto card
    if (payment_method === 'credit_card') {
      const year4Digits = card.expiration_year < 100 ? (2000 + card.expiration_year) : card.expiration_year;
      payload.card = {
        number: onlyNumbers(card.number),
        holder_name: sanitize(card.holder_name).toUpperCase(),
        expiration_month: parseInt(card.expiration_month, 10),
        expiration_year: parseInt(year4Digits, 10),
        cvv: onlyNumbers(card.cvv)
      };
      payload.installments = parseInt(card.installments, 10) || 1;
    }

    // 5. Envia para a HyzePay
    const result = await hyzepay.createTransaction(payload);
    
    if (!result || !result.success || !result.data) {
      const apiError = result?.error_messages?.[0]?.message || 'Erro desconhecido na API do gateway.';
      return res.status(400).json({ error: apiError });
    }

    const transactionId = result.data.id;

    // 6. Trata a resposta com base no método de pagamento
    if (payload.payment_method === 'pix') {
      db.setTransaction(transactionId, {
        status: 'pending',
        provider: 'hyzepay',
        customerName: sanitize(customer.name),
        customerEmail: sanitize(customer.email).toLowerCase(),
        amount: total,
        paymentMethod: 'pix'
      });

      const qrCode = result.data.pix?.qr_code || '';
      return res.json({
        success: true,
        payment_method: 'pix',
        transaction_id: transactionId,
        pix: {
          qr_code: qrCode,
          qr_code_url: result.data.pix?.url || `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrCode)}`,
          copy_paste: qrCode,
          expires_at: result.data.pix?.expiration_date || null
        }
      });

    } else {
      // Cartão de Crédito
      const isApproved = (result.data.status === 'PAID');
      
      db.setTransaction(transactionId, {
        status: isApproved ? 'paid' : 'pending',
        provider: 'hyzepay',
        customerName: sanitize(customer.name),
        customerEmail: sanitize(customer.email).toLowerCase(),
        amount: total,
        paymentMethod: 'credit_card'
      });

      if (isApproved) {
        // Envia e-mail de confirmação de forma assíncrona
        sendConfirmationEmail(
          sanitize(customer.email).toLowerCase(),
          sanitize(customer.name),
          transactionId,
          total
        ).catch(err => console.error('[CC EMAIL ERROR]', err));

        return res.json({
          success: true,
          payment_method: 'credit_card',
          transaction_id: transactionId,
          status: 'approved',
          redirect: '/obrigado'
        });
      } else {
        const reason = result.data.refused_reason || 'Transação recusada pela adquirente.';
        return res.json({
          success: false,
          payment_method: 'credit_card',
          status: 'rejected',
          reason: reason
        });
      }
    }

  } catch (err) {
    const responseData = err.response?.data;
    const statusCode = err.response?.status;
    console.error('[HYZEPAY TRANSACTION ERROR]', statusCode, JSON.stringify(responseData) || err.message);
    const apiError = responseData?.error_messages?.[0]?.message || responseData?.message || responseData?.error || err.message;
    res.status(statusCode || 500).json({ error: apiError || 'Erro ao processar pagamento.', detail: responseData });
  }
});

function validateCustomer(c) {
  const errors = [];
  if (!c.name || c.name.trim().length < 3) errors.push('Nome inválido (mínimo 3 caracteres).');
  
  // Validação simples de nome e sobrenome
  const nameParts = c.name.trim().split(/\s+/);
  if (nameParts.length < 2 || nameParts[0].length < 2 || nameParts[1].length < 2) {
    errors.push('Por favor, informe nome e sobrenome.');
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
