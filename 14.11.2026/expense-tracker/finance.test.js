const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('./finance.js');

test('migration keeps every valid old expense and does not change the old key', () => {
  const old = JSON.stringify([{ id:'e1', name:'Кава', amountKopecks:1234, category:'Їжа' }]);
  const state = F.migrateLegacy(old, '2026-11-14');
  assert.equal(state.transactions.length, 1);
  assert.equal(state.transactions[0].amountKopecks, 1234);
  assert.equal(state.transactions[0].type, 'expense');
  assert.equal(state.transactions[0].date, '2026-11-14');
});

test('money parses to kopecks exactly', () => {
  assert.equal(F.parseMoney('12,34'), 1234);
  assert.equal(F.parseMoney('0.01'), 1);
  assert.equal(F.parseMoney('0'), null);
  assert.equal(F.parseMoney('1.234'), null);
});

test('all-time expense totals include every month and keep currencies separate', () => {
  const state = F.emptyState();
  state.accounts.push({id:'euros',name:'Євро',type:'bank',currency:'EUR',openingKopecks:0,archived:false});
  state.transactions = [
    {type:'expense',amountKopecks:125,date:'2025-01-10',accountId:'cash'},
    {type:'expense',amountKopecks:235,date:'2026-11-15',accountId:'cash'},
    {type:'expense',amountKopecks:450,date:'2024-03-01',accountId:'euros'},
    {type:'income',amountKopecks:1000,date:'2026-11-15',accountId:'cash'},
    {type:'transfer',amountKopecks:200,date:'2026-11-15',accountId:'cash',toAccountId:'euros'}
  ];
  assert.deepEqual(F.allTimeExpenseTotals(state), {UAH:360,EUR:450,USD:0});
});

test('balances account for income, expense, and transfer once', () => {
  const state = F.emptyState();
  state.accounts.push({id:'bank', name:'Картка', openingKopecks:1000, archived:false});
  state.transactions = [
    {id:'i',type:'income',amountKopecks:5000,accountId:'cash',date:'2026-11-14'},
    {id:'e',type:'expense',amountKopecks:1200,accountId:'cash',date:'2026-11-14'},
    {id:'t',type:'transfer',amountKopecks:2000,accountId:'cash',toAccountId:'bank',date:'2026-11-14'}
  ];
  assert.equal(F.accountBalance(state,'cash'), 1800);
  assert.equal(F.accountBalance(state,'bank'), 3000);
  assert.deepEqual(F.periodTotals(state.transactions,'2026-11-01','2026-11-30'), { income:5000, expense:1200, net:3800 });
});

test('combined filters narrow records without changing source', () => {
  const rows=[
    {id:'1',title:'Кава',type:'expense',categoryId:'food',accountId:'cash',amountKopecks:1000,date:'2026-11-10',tags:['ранок']},
    {id:'2',title:'Метро',type:'expense',categoryId:'transport',accountId:'cash',amountKopecks:800,date:'2026-11-11',tags:[]}
  ];
  assert.deepEqual(F.filterTransactions(rows,{query:'кав',categoryId:'food',minKopecks:900,tag:'ранок'}).map(x=>x.id),['1']);
  assert.equal(rows.length,2);
  assert.deepEqual(F.filterTransactions([{id:'3',title:'Кава',type:'expense',categoryId:'cafe',accountId:'cash',amountKopecks:1000,date:'2026-11-12',tags:[]}],{categoryId:'food'},F.DEFAULT_CATEGORIES).map(t=>t.id),['3']);
});

test('budget spending uses its period and category', () => {
  const rows=[
    {type:'expense',amountKopecks:3000,categoryId:'food',date:'2026-11-11'},
    {type:'expense',amountKopecks:2000,categoryId:'transport',date:'2026-11-11'},
    {type:'expense',amountKopecks:4000,categoryId:'food',date:'2026-10-11'}
  ];
  assert.equal(F.budgetSpent({categoryId:'food',start:'2026-11-01',end:'2026-11-30'},rows),3000);
  const nested=[{type:'expense',amountKopecks:1500,categoryId:'cafe',date:'2026-11-12'}];
  assert.equal(F.budgetSpent({categoryId:'food',start:'2026-11-01',end:'2026-11-30'},nested,F.DEFAULT_CATEGORIES),1500);
});

test('recurring dates advance without creating transactions', () => {
  assert.equal(F.advanceDate('2026-01-31','monthly'),'2026-02-28');
  assert.equal(F.advanceDate('2026-02-28','monthly',31),'2026-03-31');
  assert.equal(F.advanceDate('2026-11-14','weekly'),'2026-11-21');
});

test('backup validation rejects malformed data and accepts a full state', () => {
  assert.throws(()=>F.validateBackup({version:99}),/версі/);
  assert.equal(F.validateBackup(F.emptyState()).version,3);
});

test('version 2 data gains UAH accounts and plans without losing records', () => {
  const old=F.emptyState(); old.version=2;
  old.accounts[0]={id:'cash',name:'Готівка',openingKopecks:1234,archived:false};
  old.transactions.push({id:'old',title:'Кава',type:'expense',amountKopecks:250,accountId:'cash',categoryId:'food',date:'2026-11-15',tags:[]});
  old.budgets.push({id:'budget',name:'Їжа',limitKopecks:5000,start:'2026-11-01',end:'2026-11-30',categoryId:'food'});
  old.goals.push({id:'goal',name:'Резерв',targetKopecks:10000,currentKopecks:1000});
  const migrated=F.validateBackup(old);
  assert.equal(migrated.version,3);
  assert.deepEqual([migrated.accounts[0].currency,migrated.accounts[0].type],['UAH','cash']);
  assert.equal(migrated.transactions[0].amountKopecks,250);
  assert.equal(migrated.budgets[0].currency,'UAH');
  assert.equal(migrated.goals[0].currency,'UAH');
  assert.equal(F.accountBalance(migrated,'cash'),984);
});

test('different currencies remain separate and cross-currency transfer uses received amount', () => {
  const state=F.emptyState();
  state.accounts.push({id:'eur',name:'Готівка',type:'cash',currency:'EUR',openingKopecks:10000,archived:false});
  state.accounts.push({id:'usd',name:'Банк',type:'bank',currency:'USD',openingKopecks:0,archived:false});
  state.transactions.push({id:'exchange',title:'Обмін',type:'transfer',amountKopecks:5000,toAmountKopecks:5600,accountId:'eur',toAccountId:'usd',date:'2026-11-15',tags:[]});
  state.transactions.push({id:'coffee',title:'Кава',type:'expense',amountKopecks:600,accountId:'eur',categoryId:'food',date:'2026-11-15',tags:[]});
  assert.equal(F.accountBalance(state,'eur'),4400);
  assert.equal(F.accountBalance(state,'usd'),5600);
  assert.deepEqual(F.totalsByCurrency(state,'2026-11-01','2026-11-30').EUR,{income:0,expense:600,net:-600});
  assert.deepEqual(F.totalsByCurrency(state,'2026-11-01','2026-11-30').USD,{income:0,expense:0,net:0});
  assert.equal(F.validateBackup(state).transactions[0].toAmountKopecks,5600);
  const missing=structuredClone(state); delete missing.transactions[0].toAmountKopecks;
  assert.throws(()=>F.validateBackup(missing),/транзакції/);
  const sameCurrency=structuredClone(state); sameCurrency.accounts.find(a=>a.id==='usd').currency='EUR';
  assert.throws(()=>F.validateBackup(sameCurrency),/транзакції/);
});

test('budget spending includes only transactions in its currency', () => {
  const state=F.emptyState();
  state.accounts.push({id:'eur',name:'Банк',type:'bank',currency:'EUR',openingKopecks:0,archived:false});
  const rows=[{type:'expense',amountKopecks:3000,accountId:'cash',categoryId:'food',date:'2026-11-15'},
    {type:'expense',amountKopecks:2000,accountId:'eur',categoryId:'food',date:'2026-11-15'}];
  assert.equal(F.budgetSpent({currency:'EUR',categoryId:'food',start:'2026-11-01',end:'2026-11-30'},rows,state.categories,state.accounts),2000);
});

test('CSV import preserves currency and received amount in cross-currency transfers', () => {
  const state=F.emptyState();
  state.accounts.push({id:'eur',name:'Готівка',type:'cash',currency:'EUR',openingKopecks:0,archived:false});
  const rows=[['Назва','Сума','Валюта','Дата','Тип','Рахунок','Рахунок отримувача','Валюта отримувача','Сума зарахування'],
    ['Обмін','100.00','UAH','2026-11-15','transfer','Готівка','Готівка','EUR','2.20']];
  const map={title:'0',amount:'1',currency:'2',date:'3',type:'4',account:'5',destination:'6',destinationCurrency:'7',toAmount:'8'};
  const result=F.mapCsvTransactions(rows,map,state);
  assert.deepEqual(result.problems,[]);
  assert.equal(result.pending[0].accountId,'cash');
  assert.equal(result.pending[0].toAccountId,'eur');
  assert.equal(result.pending[0].toAmountKopecks,220);
});

test('CSV parser handles quotes and duplicate detection', () => {
  const rows=F.parseCSV('Назва,Сума\n"Кава, чай",12.50\n');
  assert.deepEqual(rows,[['Назва','Сума'],['Кава, чай','12.50']]);
  const item={title:'Кава',amountKopecks:1000,type:'expense',accountId:'cash',date:'2026-11-14'};
  assert.equal(F.transactionFingerprint(item),F.transactionFingerprint({...item,id:'other'}));
  assert.match(F.toCSV([['=SUM(A1:A2)']]),/^'=SUM/);
});

test('CSV import skips invalid rows and duplicates without replacing existing records', () => {
  const state=F.emptyState();
  state.transactions.push({id:'old',title:'Кава',type:'expense',amountKopecks:1000,date:'2026-11-14',accountId:'cash'});
  const rows=[['Назва','Сума','Дата','Тип'],['Кава','10.00','2026-11-14','витрата'],['Чай','5.50','2026-11-15','витрата'],['Помилка','-2','2026-11-16','витрата']];
  const result=F.mapCsvTransactions(rows,{title:'0',amount:'1',date:'2',type:'3',account:'',category:'',note:'',tags:''},state);
  assert.equal(result.pending.length,1);
  assert.equal(result.pending[0].amountKopecks,550);
  assert.deepEqual(result.problems,[2,4]);
  assert.equal(state.transactions.length,1);
});

test('CSV import preserves transfers between named accounts', () => {
  const state=F.emptyState(); state.accounts.push({id:'bank',name:'Картка',openingKopecks:0,archived:false});
  const rows=[['Дата','Тип','Назва','Сума','Рахунок','Рахунок отримувача'],['2026-11-14','transfer','Переказ', '100.00','Готівка','Картка']];
  const map={date:'0',type:'1',title:'2',amount:'3',account:'4',destination:'5',category:'',note:'',tags:''};
  const result=F.mapCsvTransactions(rows,map,state);
  assert.equal(result.pending[0].type,'transfer');
  assert.equal(result.pending[0].toAccountId,'bank');
  assert.deepEqual(result.problems,[]);
});

test('twelve sample expenses have realistic amounts and are added only once', () => {
  const state=F.emptyState();
  const first=F.addSampleExpenses(state,'2026-11-14');
  assert.equal(first.added,12);
  assert.equal(first.state.transactions.length,12);
  assert(first.state.transactions.every(t=>t.type==='expense' && t.amountKopecks>0 && t.accountId==='cash'));
  assert(first.state.transactions.some(t=>t.title==='Заправка авто'));
  assert(first.state.transactions.some(t=>t.title==='Кіно'));
  assert.equal(F.addSampleExpenses(first.state,'2026-11-14').added,0);
  assert.equal(state.transactions.length,0);
});

test('starter expense categories are broad and older data gains them once', () => {
  const state=F.emptyState();
  assert(F.DEFAULT_CATEGORIES.filter(c=>c.type==='expense').length>=20);
  for(const name of ['Пальне','Кафе й ресторани','Продукти','Аптека','Кіно','Комунальні послуги']) {
    assert(state.categories.some(c=>c.name===name && c.type==='expense'));
  }
  state.categories=state.categories.filter(c=>['food','transport','shopping','other','income'].includes(c.id));
  state.settings.categoryCatalogVersion=1;
  state.categories.push({id:'custom',name:'Моє',type:'expense',parentId:null});
  const upgraded=F.upgradeStarterCategories(state);
  assert(upgraded.categories.some(c=>c.id==='custom'));
  assert.equal(F.upgradeStarterCategories(upgraded).categories.length,upgraded.categories.length);
  assert.equal(state.categories.length,6);
});

test('payment methods support multiple choices and sample expenses use several', () => {
  assert(F.PAYMENT_METHODS.some(m=>m.id==='cash'));
  assert(F.PAYMENT_METHODS.some(m=>m.id==='card'));
  assert(F.PAYMENT_METHODS.length>=6);
  const samples=F.addSampleExpenses(F.emptyState(),'2026-11-14').state.transactions;
  assert(new Set(samples.map(t=>t.paymentMethod)).size>=3);
  const backup=F.emptyState();
  backup.transactions.push({...samples[0],id:'one',paymentMethod:'card'});
  assert.equal(F.validateBackup(backup).transactions[0].paymentMethod,'card');
  backup.transactions[0].paymentMethod='invalid';
  assert.throws(()=>F.validateBackup(backup),/спосіб/);
});

test('payment method filter and CSV import keep the selected method', () => {
  const state=F.emptyState();
  const rows=[['Назва','Сума','Дата','Спосіб оплати'],['Кава','25','2026-11-14','Картка']];
  const result=F.mapCsvTransactions(rows,{title:'0',amount:'1',date:'2',type:'',account:'',category:'',paymentMethod:'3',note:'',tags:''},state);
  assert.equal(result.pending[0].paymentMethod,'card');
  assert.deepEqual(F.filterTransactions([{paymentMethod:'card',title:'Кава',tags:[]},{title:'Чай',tags:[]}],{paymentMethod:'card'}).map(t=>t.title),['Кава']);
});

test('sample expenses are initialized once and stay deleted after a reload', () => {
  const initial=F.ensureSampleExpensesOnce(F.emptyState(),'2026-11-14');
  assert.equal(initial.added,12);
  initial.state.transactions.shift();
  const reloaded=F.ensureSampleExpensesOnce(initial.state,'2026-11-15');
  assert.equal(reloaded.added,0);
  assert.equal(reloaded.state.transactions.length,11);
});

test('category detail URLs encode unique category IDs',()=>{
  assert.equal(F.categoryUrl('food'),'category.html?id=food');
  assert.equal(F.categoryUrl('кава & чай'),'category.html?id=%D0%BA%D0%B0%D0%B2%D0%B0%20%26%20%D1%87%D0%B0%D0%B9');
});
