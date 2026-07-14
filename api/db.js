/**
 * api/db.js — Banco de dados em memória simples para transações
 */

const transactions = {};

module.exports = {
  setTransaction: (id, data) => {
    transactions[String(id)] = {
      ...transactions[String(id)],
      ...data,
      updatedAt: new Date()
    };
  },
  getTransaction: (id) => {
    return transactions[String(id)];
  },
  setStatus: (id, status) => {
    if (!transactions[String(id)]) {
      transactions[String(id)] = {};
    }
    transactions[String(id)].status = status;
    transactions[String(id)].updatedAt = new Date();
  },
  getStatus: (id) => {
    return transactions[String(id)] ? transactions[String(id)].status : 'pending';
  }
};
