/**
 * api/db.js — Banco de dados em memória simples para transações
 */

const transactions = {};

module.exports = {
  setStatus: (id, status) => {
    transactions[String(id)] = {
      status,
      updatedAt: new Date()
    };
  },
  getStatus: (id) => {
    return transactions[String(id)] ? transactions[String(id)].status : 'pending';
  }
};
