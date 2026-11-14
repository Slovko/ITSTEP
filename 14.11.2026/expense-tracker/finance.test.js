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
});

test('budget spending uses its period and category', () => {
  const rows=[
    {type:'expense',amountKopecks:3000,categoryId:'food',date:'2026-11-11'},
    {type:'expense',amountKopecks:2000,categoryId:'transport',date:'2026-11-11'},
    {type:'expense',amountKopecks:4000,categoryId:'food',date:'2026-10-11'}
  ];
  assert.equal(F.budgetSpent({categoryId:'food',start:'2026-11-01',end:'2026-11-30'},rows),3000);
});

test('recurring dates advance without creating transactions', () => {
  assert.equal(F.advanceDate('2026-01-31','monthly'),'2026-02-28');
  assert.equal(F.advanceDate('2026-02-28','monthly',31),'2026-03-31');
  assert.equal(F.advanceDate('2026-11-14','weekly'),'2026-11-21');
});

test('backup validation rejects malformed data and accepts a full state', () => {
  assert.throws(()=>F.validateBackup({version:99}),/версі/);
  assert.equal(F.validateBackup(F.emptyState()).version,2);
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

