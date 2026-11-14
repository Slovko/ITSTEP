const CATEGORIES = ['Їжа', 'Транспорт', 'Покупки', 'Інше'];
const STORAGE_KEY = 'expense-tracker-v1';

function parseAmount(raw) {
  const value = String(raw).trim().replace(',', '.');
  if (!/^(?:\d+)(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(result) && result > 0 ? result : null;
}

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

function validateRegistration({ username, email, password, confirmation, terms }) {
  const errors = {};
  if (String(username).trim().length < 3) errors.username = 'Ім’я має містити щонайменше 3 символи.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) errors.email = 'Введіть коректну адресу email.';
  if (String(password).length < 8) errors.password = 'Пароль має містити щонайменше 8 символів.';
  if (confirmation !== password) errors.confirmation = 'Паролі повинні збігатися.';
  if (!terms) errors.terms = 'Підтвердьте згоду з умовами.';
  return errors;
}

function normalizeExpenses(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(item => item && typeof item.id === 'string' && item.id && typeof item.name === 'string' && item.name.trim() && Number.isSafeInteger(item.amountKopecks) && item.amountKopecks > 0 && CATEGORIES.includes(item.category))
      .map(item => ({ id: item.id, name: item.name.trim(), amountKopecks: item.amountKopecks, category: item.category }));
  } catch {
    return [];
  }
}

if (typeof module !== 'undefined') module.exports = { parseAmount, validateExpense, calculateTotals, filterExpenses, validateRegistration, normalizeExpenses };

if (typeof document !== 'undefined') {
  const money = new Intl.NumberFormat('uk-UA', { style: 'currency', currency: 'UAH', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const expenseForm = document.querySelector('#expense-form');
  const registrationForm = document.querySelector('#registration-form');
  const list = document.querySelector('#expense-list');
  const empty = document.querySelector('#empty-state');
  const total = document.querySelector('#total-amount');
  const categoryTotals = document.querySelector('#category-totals');
  const count = document.querySelector('#result-count');
  const filter = document.querySelector('#category-filter');
  const search = document.querySelector('#expense-search');
  const clearButton = document.querySelector('#clear-all');
  const storageNotice = document.querySelector('#storage-notice');
  let expenses = [];

  try { expenses = normalizeExpenses(localStorage.getItem(STORAGE_KEY)); }
  catch { storageNotice.hidden = false; }

  function saveExpenses() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
      storageNotice.hidden = true;
    } catch {
      storageNotice.hidden = false;
    }
  }

  function setError(form, field, message) {
    const input = form.elements.namedItem(field);
    const error = form.querySelector(`#${field}-error`);
    error.textContent = message || '';
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
  }

  function render() {
    const { total: sum, byCategory } = calculateTotals(expenses);
    total.textContent = money.format(sum / 100);
    categoryTotals.replaceChildren();
    for (const category of CATEGORIES) {
      const row = document.createElement('div');
      row.className = 'category-row';
      const label = document.createElement('span');
      label.textContent = category;
      const amount = document.createElement('strong');
      amount.textContent = money.format(byCategory[category] / 100);
      row.append(label, amount);
      categoryTotals.append(row);
    }

    const visible = filterExpenses(expenses, filter.value, search.value);
    list.replaceChildren();
    for (const item of visible) {
      const li = document.createElement('li');
      li.className = 'expense-item';
      const details = document.createElement('div');
      details.className = 'expense-details';
      const name = document.createElement('strong');
      name.textContent = item.name;
      const category = document.createElement('span');
      category.textContent = item.category;
      details.append(name, category);
      const amount = document.createElement('strong');
      amount.className = 'expense-amount';
      amount.textContent = money.format(item.amountKopecks / 100);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'remove-button';
      remove.textContent = 'Видалити';
      remove.setAttribute('aria-label', `Видалити витрату «${item.name}»`);
      remove.addEventListener('click', () => {
        expenses = expenses.filter(expense => expense.id !== item.id);
        saveExpenses();
        render();
      });
      li.append(details, amount, remove);
      list.append(li);
    }
    count.textContent = `Знайдено: ${visible.length}`;
    empty.textContent = expenses.length ? 'За цим запитом витрат немає.' : 'Поки немає витрат. Додайте першу у формі.';
    empty.hidden = visible.length > 0;
    clearButton.disabled = expenses.length === 0;
  }

  expenseForm.addEventListener('submit', event => {
    event.preventDefault();
    const result = validateExpense(expenseForm.elements.namedItem('name').value, expenseForm.elements.namedItem('amount').value, expenseForm.elements.namedItem('category').value);
    for (const field of ['name', 'amount', 'category']) setError(expenseForm, field, result.errors[field]);
    if (Object.keys(result.errors).length) {
      expenseForm.elements.namedItem(Object.keys(result.errors)[0]).focus();
      return;
    }
    expenses.unshift({ id: crypto.randomUUID(), name: result.name, amountKopecks: result.amountKopecks, category: result.category });
    saveExpenses();
    expenseForm.reset();
    expenseForm.elements.namedItem('name').focus();
    render();
  });

  for (const field of ['name', 'amount', 'category']) {
    expenseForm.elements.namedItem(field).addEventListener('input', () => setError(expenseForm, field, ''));
  }
  filter.addEventListener('change', render);
  search.addEventListener('input', render);
  clearButton.addEventListener('click', () => {
    if (!expenses.length || !window.confirm('Видалити всі витрати? Цю дію неможливо скасувати.')) return;
    expenses = [];
    saveExpenses();
    render();
  });

  registrationForm.addEventListener('submit', event => {
    event.preventDefault();
    const data = Object.fromEntries(['username', 'email', 'password', 'confirmation'].map(field => [field, registrationForm.elements.namedItem(field).value]));
    data.terms = registrationForm.elements.namedItem('terms').checked;
    const errors = validateRegistration(data);
    for (const field of ['username', 'email', 'password', 'confirmation', 'terms']) setError(registrationForm, field, errors[field]);
    const success = document.querySelector('#registration-success');
    success.hidden = Object.keys(errors).length > 0;
    if (success.hidden) registrationForm.elements.namedItem(Object.keys(errors)[0]).focus();
    else registrationForm.reset();
  });

  for (const field of ['username', 'email', 'password', 'confirmation', 'terms']) {
    const input = registrationForm.elements.namedItem(field);
    input.addEventListener(field === 'terms' ? 'change' : 'input', () => {
      setError(registrationForm, field, '');
      document.querySelector('#registration-success').hidden = true;
    });
  }

  render();
}

