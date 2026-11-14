const test = require('node:test');
const assert = require('node:assert/strict');

const { parseAmount, validateExpense, calculateTotals, filterExpenses, validateRegistration, normalizeExpenses } = require('./script.js');

test('amounts use whole kopecks and reject invalid precision', () => {
  assert.equal(parseAmount('12,34'), 1234);
  assert.equal(parseAmount('0.01'), 1);
  assert.equal(parseAmount('0'), null);
  assert.equal(parseAmount('-2'), null);
  assert.equal(parseAmount('1.234'), null);
  assert.equal(parseAmount('Infinity'), null);
});

test('expense validation trims names and checks required fields', () => {
  assert.deepEqual(validateExpense('  Кава  ', '45.50', 'Їжа'), { name: 'Кава', amountKopecks: 4550, category: 'Їжа', errors: {} });
  assert.equal(validateExpense('  ', '0', 'Невідома').errors.name.length > 0, true);
  assert.equal(validateExpense('  ', '0', 'Невідома').errors.amount.length > 0, true);
  assert.equal(validateExpense('  ', '0', 'Невідома').errors.category.length > 0, true);
});

test('totals include all categories and filters combine', () => {
  const items = [
    { id: '1', name: 'Кава', amountKopecks: 1250, category: 'Їжа' },
    { id: '2', name: 'Метро', amountKopecks: 800, category: 'Транспорт' },
    { id: '3', name: 'Кавоварка', amountKopecks: 10000, category: 'Покупки' },
  ];
  assert.deepEqual(calculateTotals(items), { total: 12050, byCategory: { 'Їжа': 1250, 'Транспорт': 800, 'Покупки': 10000, 'Інше': 0 } });
  assert.deepEqual(filterExpenses(items, 'Їжа', 'каВ'), [items[0]]);
  assert.deepEqual(filterExpenses(items, 'Усі категорії', 'каВ'), [items[0], items[2]]);
});

test('registration reports each invalid field and accepts valid input', () => {
  const invalid = validateRegistration({ username: ' Я ', email: 'bad', password: 'short', confirmation: 'other', terms: false });
  assert.deepEqual(Object.keys(invalid), ['username', 'email', 'password', 'confirmation', 'terms']);
  assert.deepEqual(validateRegistration({ username: ' Ярослав ', email: 'yaroslav@example.com', password: 'password8', confirmation: 'password8', terms: true }), {});
});

test('stored data is normalized and invalid records are ignored', () => {
  assert.deepEqual(normalizeExpenses('not json'), []);
  assert.deepEqual(normalizeExpenses(JSON.stringify([{ id: '1', name: 'Кава', amountKopecks: 100, category: 'Їжа' }, { id: '2', name: '<b>', amountKopecks: -1, category: 'Їжа' }])), [{ id: '1', name: 'Кава', amountKopecks: 100, category: 'Їжа' }]);
});

