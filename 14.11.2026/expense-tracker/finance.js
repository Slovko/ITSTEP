(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Finance = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VERSION = 3;
  const CURRENCIES = ['UAH','EUR','USD'];
  const ACCOUNT_TYPES = ['cash','bank'];
  const DEFAULT_CATEGORIES = [
    { id: 'food', name: 'Їжа', type: 'expense', parentId: null },
    { id: 'groceries', name: 'Продукти', type: 'expense', parentId: 'food' },
    { id: 'cafe', name: 'Кафе й ресторани', type: 'expense', parentId: 'food' },
    { id: 'transport', name: 'Транспорт', type: 'expense', parentId: null },
    { id: 'fuel', name: 'Пальне', type: 'expense', parentId: 'transport' },
    { id: 'taxi', name: 'Таксі', type: 'expense', parentId: 'transport' },
    { id: 'public-transport', name: 'Громадський транспорт', type: 'expense', parentId: 'transport' },
    { id: 'shopping', name: 'Покупки', type: 'expense', parentId: null },
    { id: 'clothes', name: 'Одяг і взуття', type: 'expense', parentId: 'shopping' },
    { id: 'home-goods', name: 'Дім і побут', type: 'expense', parentId: 'shopping' },
    { id: 'health', name: 'Здоров’я', type: 'expense', parentId: null },
    { id: 'pharmacy', name: 'Аптека', type: 'expense', parentId: 'health' },
    { id: 'doctor', name: 'Лікарі та аналізи', type: 'expense', parentId: 'health' },
    { id: 'entertainment', name: 'Розваги', type: 'expense', parentId: null },
    { id: 'cinema', name: 'Кіно', type: 'expense', parentId: 'entertainment' },
    { id: 'hobbies', name: 'Хобі', type: 'expense', parentId: 'entertainment' },
    { id: 'utilities', name: 'Комунальні послуги', type: 'expense', parentId: null },
    { id: 'rent', name: 'Оренда житла', type: 'expense', parentId: null },
    { id: 'subscriptions', name: 'Підписки та сервіси', type: 'expense', parentId: null },
    { id: 'education', name: 'Освіта', type: 'expense', parentId: null },
    { id: 'travel', name: 'Подорожі', type: 'expense', parentId: null },
    { id: 'gifts', name: 'Подарунки', type: 'expense', parentId: null },
    { id: 'pets', name: 'Домашні тварини', type: 'expense', parentId: null },
    { id: 'beauty', name: 'Краса та догляд', type: 'expense', parentId: null },
    { id: 'sports', name: 'Спорт', type: 'expense', parentId: null },
    { id: 'insurance', name: 'Страхування', type: 'expense', parentId: null },
    { id: 'other', name: 'Інше', type: 'expense', parentId: null },
    { id: 'income', name: 'Дохід', type: 'income', parentId: null }
  ];
  const PAYMENT_METHODS = [
    { id:'cash', name:'Готівка' }, { id:'card', name:'Картка' },
    { id:'bank_transfer', name:'Банківський переказ' }, { id:'mobile_pay', name:'Телефон або годинник' },
    { id:'online', name:'Онлайн-оплата' }, { id:'ewallet', name:'Електронний гаманець' },
    { id:'other', name:'Інше' }
  ];

  function emptyState() {
    return {
      version: VERSION,
      accounts: [{ id: 'cash', name: 'Готівка', type:'cash', currency:'UAH', openingKopecks: 0, archived: false }],
      categories: DEFAULT_CATEGORIES.map(item => ({ ...item })),
      transactions: [], budgets: [], goals: [], schedules: [], rules: [],
      settings: { currency: 'UAH', theme: 'light', categoryCatalogVersion: 2 }
    };
  }

  function upgradeStarterCategories(state) {
    const next=structuredClone(state);
    if ((next.settings.categoryCatalogVersion||0)>=2) return next;
    const ids=new Set(next.categories.map(c=>c.id));
    for (const category of DEFAULT_CATEGORIES) if (!ids.has(category.id)) {
      const parent=category.parentId && next.categories.find(c=>c.id===category.parentId);
      next.categories.push({...category,parentId:parent?.type===category.type?category.parentId:null});
    }
    next.settings.categoryCatalogVersion=2;
    return next;
  }

  function parseMoney(raw) {
    const value = String(raw ?? '').trim().replace(',', '.');
    if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
    const [whole, cents = ''] = value.split('.');
    const result = Number(whole) * 100 + Number(cents.padEnd(2, '0'));
    return Number.isSafeInteger(result) && result > 0 ? result : null;
  }

  function parseNonnegativeMoney(raw) {
    if (/^0(?:[,.]0{1,2})?$/.test(String(raw).trim())) return 0;
    return parseMoney(raw);
  }

  function validDate(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return false;
    const parsed = new Date(`${date}T12:00:00Z`);
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date;
  }

  function migrateLegacy(raw, today) {
    const state = emptyState();
    if (!validDate(today)) throw new Error('Некоректна дата міграції.');
    let rows;
    try { rows = JSON.parse(raw); } catch { return state; }
    if (!Array.isArray(rows)) return state;
    const ids = new Set();
    for (const row of rows) {
      if (!row || typeof row.name !== 'string' || !row.name.trim() ||
        !Number.isSafeInteger(row.amountKopecks) || row.amountKopecks <= 0) continue;
      const category = state.categories.find(item => item.name === row.category && item.type === 'expense');
      if (!category) continue;
      let id = typeof row.id === 'string' && row.id ? row.id : `old-${state.transactions.length + 1}`;
      while (ids.has(id)) id += '-copy';
      ids.add(id);
      state.transactions.push({ id, title: row.name.trim(), type: 'expense', amountKopecks: row.amountKopecks,
        accountId: 'cash', toAccountId: null, categoryId: category.id, date: today, note: '', tags: [] });
    }
    return state;
  }

  const SAMPLE_EXPENSES = [
    ['Заправка авто',165000,'fuel',0,'card'],
    ['Кафе',28500,'cafe',1,'card'],
    ['Продукти в магазині',124580,'groceries',2,'card'],
    ['Аптека',36840,'pharmacy',3,'mobile_pay'],
    ['Кіно',44000,'cinema',4,'online'],
    ['Проїзд автобусом',8600,'public-transport',5,'cash'],
    ['Обід у кафе',34500,'cafe',6,'cash'],
    ['Побутові товари',61890,'home-goods',8,'card'],
    ['Кава з собою',10500,'cafe',10,'cash'],
    ['Таксі',24500,'taxi',12,'online'],
    ['Одяг',179900,'clothes',15,'card'],
    ['Музична підписка',12900,'subscriptions',20,'online']
  ];

  function addSampleExpenses(state, baseDate) {
    if (!validDate(baseDate)) throw new Error('Некоректна дата прикладів.');
    const next=structuredClone(state);
    const account=next.accounts.find(a=>!a.archived && a.currency==='UAH');
    if (!account) return {state:next,added:0};
    if (!next.categories.some(c=>c.type==='expense')) next.categories.push({id:'demo-other',name:'Інше',type:'expense',parentId:null});
    const fallback=next.categories.find(c=>c.type==='expense');
    let added=0;
    SAMPLE_EXPENSES.forEach(([title,amountKopecks,categoryId,daysAgo,paymentMethod],index)=>{
      const sampleId=`sample-expense-${String(index+1).padStart(2,'0')}`;
      if (next.transactions.some(t=>t.id===sampleId)) return;
      const day=new Date(`${baseDate}T12:00:00Z`);
      day.setUTCDate(day.getUTCDate()-daysAgo);
      const category=next.categories.find(c=>c.id===categoryId && c.type==='expense') || fallback;
      next.transactions.push({id:sampleId,title,type:'expense',amountKopecks,accountId:account.id,toAccountId:null,categoryId:category.id,paymentMethod,date:day.toISOString().slice(0,10),note:'Приклад витрати',tags:['приклад']});
      added++;
    });
    return {state:next,added};
  }

  function ensureSampleExpensesOnce(state, baseDate) {
    if ((state.settings.sampleExpensesVersion||0)>=1) return {state:structuredClone(state),added:0};
    const result=addSampleExpenses(state,baseDate);
    result.state.settings.sampleExpensesVersion=1;
    return result;
  }

  function validateBackup(raw) {
    if (!raw || typeof raw !== 'object' || ![2,VERSION].includes(raw.version)) throw new Error('Непідтримувана версія резервної копії.');
    const state=structuredClone(raw);
    const names = ['accounts', 'categories', 'transactions', 'budgets', 'goals', 'schedules', 'rules'];
    if (names.some(name => !Array.isArray(state[name]))) throw new Error('У копії бракує необхідних списків.');
    if (names.some(name => state[name].some(item=>!item || typeof item!=='object'))) throw new Error('У копії є некоректні записи.');
    if (!state.settings || typeof state.settings !== 'object') throw new Error('У копії бракує налаштувань.');
    if (state.version===2) {
      state.accounts.forEach(a=>{ a.currency='UAH'; a.type=typeof a.name==='string' && a.name.toLocaleLowerCase('uk')==='готівка'?'cash':'bank'; });
      state.budgets.forEach(b=>{ b.currency='UAH'; });
      state.goals.forEach(g=>{ g.currency='UAH'; });
      state.transactions.forEach(t=>{ if(t.type==='transfer') t.toAmountKopecks=t.amountKopecks; });
      state.version=VERSION;
    }
    const unique = rows => rows.every((item, index) => item && typeof item.id === 'string' && item.id && rows.findIndex(other => other.id === item.id) === index);
    if (names.some(name => !unique(state[name]))) throw new Error('У копії є некоректні або повторні ідентифікатори.');
    if (!state.accounts.length || state.accounts.some(a => typeof a.name !== 'string' || !a.name.trim() || !ACCOUNT_TYPES.includes(a.type) || !CURRENCIES.includes(a.currency) || !Number.isSafeInteger(a.openingKopecks) || a.openingKopecks < 0)) throw new Error('Некоректні рахунки.');
    if (state.categories.some(c => typeof c.name !== 'string' || !c.name.trim() || !['expense','income'].includes(c.type) || (c.parentId && !state.categories.some(p => p.id === c.parentId && p.type === c.type)))) throw new Error('Некоректні категорії.');
    if (state.transactions.some(t => !['income','expense','transfer'].includes(t.type) || !Number.isSafeInteger(t.amountKopecks) || t.amountKopecks <= 0 || !validDate(t.date) || typeof t.title !== 'string' || !t.title.trim() || !state.accounts.some(a => a.id === t.accountId) || (t.type === 'transfer' ? (!state.accounts.some(a => a.id === t.toAccountId && a.id !== t.accountId) || !Number.isSafeInteger(t.toAmountKopecks) || t.toAmountKopecks<=0 || (state.accounts.find(a=>a.id===t.accountId).currency===state.accounts.find(a=>a.id===t.toAccountId).currency && t.toAmountKopecks!==t.amountKopecks)) : !state.categories.some(c => c.id === t.categoryId && c.type === t.type)) || !Array.isArray(t.tags))) throw new Error('Некоректні транзакції.');
    if (state.transactions.some(t => t.paymentMethod != null && !PAYMENT_METHODS.some(m => m.id === t.paymentMethod))) throw new Error('Некоректний спосіб оплати у транзакції.');
    if (state.budgets.some(b => !CURRENCIES.includes(b.currency) || !Number.isSafeInteger(b.limitKopecks) || b.limitKopecks <= 0 || !validDate(b.start) || !validDate(b.end) || b.start > b.end || (b.categoryId && !state.categories.some(c => c.id === b.categoryId)))) throw new Error('Некоректні бюджети.');
    if (state.goals.some(g => !CURRENCIES.includes(g.currency) || typeof g.name !== 'string' || !g.name.trim() || !Number.isSafeInteger(g.targetKopecks) || g.targetKopecks <= 0 || !Number.isSafeInteger(g.currentKopecks) || g.currentKopecks < 0)) throw new Error('Некоректні цілі.');
    if (state.schedules.some(s => !['income','expense'].includes(s.type) || !['daily','weekly','monthly'].includes(s.recurrence) || !validDate(s.nextDate) || !Number.isSafeInteger(s.amountKopecks) || s.amountKopecks <= 0 || !state.accounts.some(a => a.id === s.accountId) || !state.categories.some(c => c.id === s.categoryId && c.type === s.type))) throw new Error('Некоректні заплановані операції.');
    if (state.schedules.some(s => s.paymentMethod != null && !PAYMENT_METHODS.some(m => m.id === s.paymentMethod))) throw new Error('Некоректний спосіб розрахунку у запланованій операції.');
    if (state.rules.some(r => typeof r.needle !== 'string' || !r.needle.trim() || !state.categories.some(c => c.id === r.categoryId))) throw new Error('Некоректні правила.');
    return state;
  }

  function accountBalance(state, accountId) {
    const account = state.accounts.find(a => a.id === accountId);
    if (!account) return null;
    return state.transactions.reduce((balance, t) => {
      if (t.type === 'income' && t.accountId === accountId) return balance + t.amountKopecks;
      if (t.type === 'expense' && t.accountId === accountId) return balance - t.amountKopecks;
      if (t.type === 'transfer' && t.accountId === accountId) return balance - t.amountKopecks;
      if (t.type === 'transfer' && t.toAccountId === accountId) return balance + (t.toAmountKopecks ?? t.amountKopecks);
      return balance;
    }, account.openingKopecks);
  }

  function periodTotals(rows, start, end) {
    const totals = { income: 0, expense: 0, net: 0 };
    for (const t of rows) {
      if (t.date < start || t.date > end) continue;
      if (t.type === 'income') totals.income += t.amountKopecks;
      if (t.type === 'expense') totals.expense += t.amountKopecks;
    }
    totals.net = totals.income - totals.expense;
    return totals;
  }

  function totalsByCurrency(state,start,end) {
    const result=Object.fromEntries(CURRENCIES.map(currency=>[currency,{income:0,expense:0,net:0}]));
    const accounts=new Map(state.accounts.map(a=>[a.id,a]));
    for(const t of state.transactions) {
      if(t.date<start || t.date>end || t.type==='transfer') continue;
      const currency=accounts.get(t.accountId)?.currency || 'UAH';
      result[currency][t.type]+=t.amountKopecks;
    }
    for(const totals of Object.values(result)) totals.net=totals.income-totals.expense;
    return result;
  }

  function filterTransactions(rows, filters = {}, categories = []) {
    const query = String(filters.query || '').trim().toLocaleLowerCase('uk');
    const tag = String(filters.tag || '').trim().toLocaleLowerCase('uk');
    return rows.filter(t => (!query || `${t.title} ${t.note || ''}`.toLocaleLowerCase('uk').includes(query)) &&
      (!filters.type || t.type === filters.type) && (!filters.accountId || t.accountId === filters.accountId || t.toAccountId === filters.accountId) &&
      (!filters.categoryId || isCategoryWithin(t.categoryId,filters.categoryId,categories)) && (!filters.paymentMethod || (filters.paymentMethod === 'unspecified' ? !t.paymentMethod : t.paymentMethod === filters.paymentMethod)) && (!filters.start || t.date >= filters.start) && (!filters.end || t.date <= filters.end) &&
      (!filters.minKopecks || t.amountKopecks >= filters.minKopecks) && (!filters.maxKopecks || t.amountKopecks <= filters.maxKopecks) &&
      (!tag || (t.tags || []).some(value => value.toLocaleLowerCase('uk').includes(tag))));
  }

  function isCategoryWithin(categoryId, parentId, categories) {
    let current=categoryId; const seen=new Set();
    while(current && !seen.has(current)) {
      if(current===parentId) return true;
      seen.add(current);
      current=categories.find(c=>c.id===current)?.parentId;
    }
    return false;
  }
  function budgetSpent(budget, rows, categories=[], accounts=[]) {
    return rows.reduce((sum, t) => sum + (t.type === 'expense' && t.date >= budget.start && t.date <= budget.end && (!budget.categoryId || isCategoryWithin(t.categoryId,budget.categoryId,categories)) && ((accounts.find(a=>a.id===t.accountId)?.currency || 'UAH')===(budget.currency || 'UAH')) ? t.amountKopecks : 0), 0);
  }

  function advanceDate(date, recurrence, anchorDay) {
    if (!validDate(date)) throw new Error('Некоректна дата.');
    const [year, month, day] = date.split('-').map(Number);
    const d = new Date(Date.UTC(year, month - 1, day, 12));
    if (recurrence === 'daily') d.setUTCDate(d.getUTCDate() + 1);
    else if (recurrence === 'weekly') d.setUTCDate(d.getUTCDate() + 7);
    else if (recurrence === 'monthly') {
      const last = new Date(Date.UTC(year, month + 1, 0, 12)).getUTCDate();
      return `${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2,'0')}-${String(Math.min(anchorDay || day,last)).padStart(2,'0')}`;
    } else throw new Error('Невідомий період повторення.');
    return d.toISOString().slice(0,10);
  }

  function parseCSV(text) {
    const source = String(text).replace(/^\uFEFF/, '');
    const delimiter = (source.split(/\r?\n/,1)[0].match(/;/g)||[]).length > (source.split(/\r?\n/,1)[0].match(/,/g)||[]).length ? ';' : ',';
    const rows = []; let row = []; let cell = ''; let quoted = false;
    for (let i=0;i<source.length;i++) {
      const ch=source[i];
      if (quoted) { if (ch === '"' && source[i+1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted=false; else cell+=ch; }
      else if (ch === '"') quoted=true;
      else if (ch === delimiter) { row.push(cell); cell=''; }
      else if (ch === '\n') { row.push(cell.replace(/\r$/, '')); if (row.some(v=>v!=='')) rows.push(row); row=[]; cell=''; }
      else cell+=ch;
    }
    if (quoted) throw new Error('Незакриті лапки в CSV.');
    row.push(cell.replace(/\r$/, ''));
    if (row.some(v=>v!=='')) rows.push(row);
    return rows;
  }

  function transactionFingerprint(t) { return [t.date,t.type,t.accountId,t.toAccountId||'',t.amountKopecks,t.type==='transfer'?(t.toAmountKopecks??t.amountKopecks):'',String(t.title).trim().toLocaleLowerCase('uk')].join('|'); }
  function categoryUrl(id) { return `category.html?id=${encodeURIComponent(id)}`; }
  function mapCsvTransactions(rows, map, state) {
    const existing=new Set(state.transactions.map(transactionFingerprint)), pending=[], problems=[];
    rows.slice(1).forEach((row,index)=>{
      const get=key=>map[key]===''?'':String(row[Number(map[key])]??'').trim();
      const title=get('title'),amountKopecks=parseMoney(get('amount')),date=get('date');
      const rawType=get('type').toLocaleLowerCase('uk');
      const type=rawType==='дохід'||rawType==='income'?'income':rawType==='переказ'||rawType==='transfer'?'transfer':rawType===''||rawType==='витрата'||rawType==='expense'?'expense':null;
      const accountRaw=get('account'),categoryRaw=get('category'),destinationRaw=get('destination'),paymentRaw=get('paymentMethod').toLocaleLowerCase('uk');
      const currency=(get('currency')||'UAH').toUpperCase(), destinationCurrency=(get('destinationCurrency')||'UAH').toUpperCase();
      const account=accountRaw?state.accounts.find(a=>a.name.toLocaleLowerCase('uk')===accountRaw.toLocaleLowerCase('uk') && (a.currency||'UAH')===currency):state.accounts.find(a=>!a.archived && (a.currency||'UAH')===currency);
      const destination=type==='transfer'?state.accounts.find(a=>a.name.toLocaleLowerCase('uk')===destinationRaw.toLocaleLowerCase('uk') && (a.currency||'UAH')===destinationCurrency):null;
      const category=type&&type!=='transfer'?(categoryRaw?state.categories.find(c=>c.type===type&&c.name.toLocaleLowerCase('uk')===categoryRaw.toLocaleLowerCase('uk')):state.categories.find(c=>c.type===type)):null;
      const paymentMethod=paymentRaw ? PAYMENT_METHODS.find(m=>m.id===paymentRaw||m.name.toLocaleLowerCase('uk')===paymentRaw)?.id : null;
      const cross=type==='transfer' && account && destination && (account.currency||'UAH')!==(destination.currency||'UAH');
      const received=get('toAmount')?parseMoney(get('toAmount')):null;
      const toAmountKopecks=type==='transfer'?(cross?received:amountKopecks):null;
      if(!title||!amountKopecks||!validDate(date)||!type||!CURRENCIES.includes(currency)||!account||(type==='transfer'?(!destination||destination.id===account.id||!toAmountKopecks||(received&&!cross&&received!==amountKopecks)):!category)||(paymentRaw&&!paymentMethod)){problems.push(index+2);return;}
      const item={title,type,amountKopecks,toAmountKopecks,date,accountId:account.id,toAccountId:destination?.id||null,categoryId:category?.id||null,paymentMethod,note:get('note'),tags:get('tags').split(/[;,]/).map(s=>s.trim()).filter(Boolean)};
      const fingerprint=transactionFingerprint(item);
      if(existing.has(fingerprint)){problems.push(index+2);return;}
      existing.add(fingerprint);pending.push(item);
    });
    return {pending,problems};
  }
  function csvCell(value) { let s=String(value??''); if (/^[\s]*[=+\-@]/.test(s)) s=`'${s}`; return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; }
  function toCSV(rows) { return rows.map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n'; }

  return { VERSION, CURRENCIES, ACCOUNT_TYPES, DEFAULT_CATEGORIES, PAYMENT_METHODS, emptyState, upgradeStarterCategories, parseMoney, parseNonnegativeMoney, validDate, migrateLegacy, addSampleExpenses, ensureSampleExpensesOnce, validateBackup,
    accountBalance, periodTotals, totalsByCurrency, filterTransactions, isCategoryWithin, budgetSpent, advanceDate, parseCSV, transactionFingerprint, categoryUrl, mapCsvTransactions, toCSV };
});
