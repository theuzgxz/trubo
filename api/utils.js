/**
 * api/utils.js — Utilitários comuns de validação e limpeza
 */

function sanitize(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>\"\'\\]/g, '').trim();
}

function onlyNumbers(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/\D/g, '');
}

function validateCPF(cpf) {
  const clean = onlyNumbers(cpf);
  return clean.length === 11 && !/^(\d)\1+$/.test(clean);
}

function validateEmail(email) {
  if (typeof email !== 'string') return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email.trim());
}

function validatePhone(phone) {
  const clean = onlyNumbers(phone);
  return clean.length >= 10 && clean.length <= 11;
}

module.exports = {
  sanitize,
  onlyNumbers,
  validateCPF,
  validateEmail,
  validatePhone
};
