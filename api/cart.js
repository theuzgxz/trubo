/**
 * api/cart.js — Configurações do Catálogo de Produtos e Ofertas
 */

module.exports = {
  OFFER_HASH: process.env.OFFER_HASH || 'c4amzxuvt8',
  PRODUCTS: {
    '48': {
      id: '48',
      title: '48 adesivos (1 pacote)',
      price: 6790,
      product_hash: process.env.OFFER_HASH || 'c4amzxuvt8'
    },
    '96': {
      id: '96',
      title: '96 adesivos (2 pacotes)',
      price: 11560,
      product_hash: process.env.OFFER_HASH || 'c4amzxuvt8'
    },
    '144': {
      id: '144',
      title: '144 adesivos (3 pacotes)',
      price: 15200,
      product_hash: process.env.OFFER_HASH || 'c4amzxuvt8'
    }
  }
};
