const CATEGORIES = ['Їжа', 'Транспорт', 'Покупки', 'Інше'];
const STORAGE_KEY = 'expense-tracker-v1';

function parseAmount(raw) { return Finance.parseMoney(raw); }
function validateExpense(rawName, rawAmount, category) {
  const name = String(rawName).trim();
  const amountKopecks = parseAmount(rawAmount);
  const errors = {};
  if (!name) errors.name = 'Введіть назву витрати.';
  if (amountKopecks === null) errors.amount = 'Введіть суму більшу за 0, не більше двох знаків після коми.';
  if (!CATEGORIES.includes(category)) errors.category = 'Оберіть категорію.';
  return { name, amountKopecks, category, errors };
}
function calculateTotals(items) {
  const byCategory = Object.fromEntries(CATEGORIES.map(category => [category, 0]));
  for (const item of items) byCategory[item.category] += item.amountKopecks;
  return { total: Object.values(byCategory).reduce((sum, amount) => sum + amount, 0), byCategory };
}
function filterExpenses(items, category, query) {
  const search = String(query).trim().toLocaleLowerCase('uk');
  return items.filter(item => (category === 'Усі категорії' || item.category === category) && item.name.toLocaleLowerCase('uk').includes(search));
}
function normalizeExpenses(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(item => item && typeof item.id === 'string' && item.id && typeof item.name === 'string' && item.name.trim() && Number.isSafeInteger(item.amountKopecks) && item.amountKopecks > 0 && CATEGORIES.includes(item.category))
      .map(item => ({ id: item.id, name: item.name.trim(), amountKopecks: item.amountKopecks, category: item.category }));
  } catch { return []; }
}
function validateRegistration({ username, email, password, confirmation, terms }) {
  const errors = {};
  if (String(username).trim().length < 3) errors.username = 'Ім’я має містити щонайменше 3 символи.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) errors.email = 'Введіть коректну адресу email.';
  if (String(password).length < 8) errors.password = 'Пароль має містити щонайменше 8 символів.';
  if (confirmation !== password) errors.confirmation = 'Паролі повинні збігатися.';
  if (!terms) errors.terms = 'Підтвердьте згоду з умовами.';
  return errors;
}

if (typeof module !== 'undefined') {
  globalThis.Finance = require('./finance.js');
  module.exports = { parseAmount, validateExpense, calculateTotals, filterExpenses, normalizeExpenses, validateRegistration };
}

if (typeof document !== 'undefined') {
  const form = document.querySelector('#registration-form');
  const fields = ['username','email','password','confirmation','terms'];
  const success = document.querySelector('#registration-success');
  function setError(field, message) {
    const input = form.elements.namedItem(field);
    form.querySelector(`#${field}-error`).textContent = message || '';
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    const data = Object.fromEntries(fields.filter(field => field !== 'terms').map(field => [field,form.elements.namedItem(field).value]));
    data.terms = form.elements.namedItem('terms').checked;
    const errors = validateRegistration(data);
    fields.forEach(field => setError(field, errors[field]));
    success.hidden = Object.keys(errors).length > 0;
    if (success.hidden) form.elements.namedItem(Object.keys(errors)[0]).focus();
    else form.reset();
  });
  fields.forEach(field => form.elements.namedItem(field).addEventListener(field === 'terms' ? 'change' : 'input', () => {
    setError(field,''); success.hidden = true;
  }));
}

