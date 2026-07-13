/**
 * server.js — Servidor Express para Checkout Seguro Yampi Style
 */

require('dotenv').config();

const express    = require('express');
const helmet     = require('helmet');
const cors       = require('cors');
const rateLimit  = require('express-rate-limit');
const path       = require('path');

const webhookRouter  = require('./api/webhook');
const tribopayRouter = require('./api/tribopay_router');

const app  = express();
const PORT = process.env.PORT || 3001;

// Configuração de segurança de cabeçalhos (Helmet)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'", "https://connect.facebook.net", "https://viacep.com.br", "https://hcaptcha-endpoint.yampi.io", "https://www.mercadopago.com", "https://www.googletagmanager.com", "https://www.google-analytics.com", "https://cdn.yampi.io", "https://www.clarity.ms"],
      styleSrc:   ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://fonts.gstatic.com", "https://icons-sg.yampi.io", "https://fonts.dooki.com.br", "https://awesome-assets.yampi.me"],
      fontSrc:    ["'self'", "https://fonts.gstatic.com", "https://icons-sg.yampi.io", "https://fonts.dooki.com.br", "https://awesome-assets.yampi.me"],
      imgSrc:     ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://viacep.com.br", "https://connect.facebook.net", "https://hcaptcha-endpoint.yampi.io", "https://buyer.yampi.io", "https://reverb.yampi.io", "https://www.clarity.ms", "https://c.bing.com"],
    },
  },
}));

// Rate Limiters
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10000, // Aumentado para evitar bloqueio em testes
  message: { error: 'Muitas requisições. Tente novamente mais tarde.' },
});

const checkoutLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10000, // Aumentado para evitar bloqueio em testes
  message: { error: 'Muitas tentativas de checkout. Aguarde alguns minutos.' },
});

app.use(cors());
app.use(limiter);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Desabilita cache em desenvolvimento para evitar arquivos antigos salvos no navegador
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Arquivos estáticos do frontend
app.use(express.static(path.join(__dirname, 'public')));

// Rotas da API
app.use('/api/webhook/tribopay', webhookRouter);
app.use('/api/tribopay',         checkoutLimiter, tribopayRouter);

// Rota para consulta de parcelas e status (simplificada no roteador de checkout)
app.use('/api/checkout', checkoutLimiter, require('./api/checkout_fallback'));

// Página de obrigado
app.get('/obrigado', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'obrigado.html'));
});

app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada.' });
});

app.use((err, req, res, next) => {
  console.error('[ERRO GLOBAL]', err.message);
  res.status(500).json({ error: 'Erro interno do servidor.' });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Servidor de Checkout rodando em http://localhost:${PORT}`);
});
