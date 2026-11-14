(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Finance = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VERSION = 2;
  const DEFAULT_CATEGORIES = [
    { id: 'food', name: 'Їжа', type: 'expense', parentId: null },
    { id: 'transport', name: 'Транспорт', type: 'expense', parentId: null },
    { id: 'shopping', name: 'Покупки', type: 'expense', parentId: null },
    { id: 'other', name: 'Інше', type: 'expense', parentId: null },
    { id: 'income', name: 'Дохід', type: 'income', parentId: null }
  ];

  function emptyState() {
    return {
      version: VERSION,
      accounts: [{ id: 'cash', name: 'Готівка', openingKopecks: 0, archived: false }],
      categories: DEFAULT_CATEGORIES.map(item => ({ ...item })),
      transactions: [], budgets: [], goals: [], schedules: [], rules: [],
      settings: { currency: 'UAH', theme: 'light' }
    };
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
    ['Заправка авто',165000,'transport',0],
    ['Кафе',28500,'food',1],
    ['Продукти в магазині',124580,'food',2],
    ['Аптека',36840,'other',3],
    ['Кіно',44000,'other',4],
    ['Проїзд автобусом',8600,'transport',5],
    ['Обід у кафе',34500,'food',6],
    ['Побутові товари',61890,'shopping',8],
    ['Кава з собою',10500,'food',10],
    ['Таксі',24500,'transport',12],
    ['Одяг',179900,'shopping',15],
    ['Музична підписка',12900,'other',20]
  ];

  function addSampleExpenses(state, baseDate) {
    if (!validDate(baseDate)) throw new Error('Некоректна дата прикладів.');
    const next=structuredClone(state);
    const account=next.accounts.find(a=>!a.archived);
    if (!account) return {state:next,added:0};
    if (!next.categories.some(c=>c.type==='expense')) next.categories.push({id:'demo-other',name:'Інше',type:'expense',parentId:null});
    const fallback=next.categories.find(c=>c.type==='expense');
    let added=0;
    SAMPLE_EXPENSES.forEach(([title,amountKopecks,categoryId,daysAgo],index)=>{
      const sampleId=`sample-expense-${String(index+1).padStart(2,'0')}`;
      if (next.transactions.some(t=>t.id===sampleId)) return;
      const day=new Date(`${baseDate}T12:00:00Z`);
      day.setUTCDate(day.getUTCDate()-daysAgo);
      const category=next.categories.find(c=>c.id===categoryId && c.type==='expense') || fallback;
      next.transactions.push({id:sampleId,title,type:'expense',amountKopecks,accountId:account.id,toAccountId:null,categoryId:category.id,date:day.toISOString().slice(0,10),note:'Приклад витрати',tags:['приклад']});
      added++;
    });
    return {state:next,added};
  }

  function validateBackup(raw) {
    if (!raw || typeof raw !== 'object' || raw.version !== VERSION) throw new Error('Непідтримувана версія резервної копії.');
    const names = ['accounts', 'categories', 'transactions', 'budgets', 'goals', 'schedules', 'rules'];
    if (names.some(name => !Array.isArray(raw[name]))) throw new Error('У копії бракує необхідних списків.');
    if (!raw.settings || typeof raw.settings !== 'object') throw new Error('У копії бракує налаштувань.');
    const unique = rows => rows.every((item, index) => item && typeof item.id === 'string' && item.id && rows.findIndex(other => other.id === item.id) === index);
    if (names.some(name => !unique(raw[name]))) throw new Error('У копії є некоректні або повторні ідентифікатори.');
    if (!raw.accounts.length || raw.accounts.some(a => typeof a.name !== 'string' || !a.name.trim() || !Number.isSafeInteger(a.openingKopecks) || a.openingKopecks < 0)) throw new Error('Некоректні рахунки.');
    if (raw.categories.some(c => typeof c.name !== 'string' || !c.name.trim() || !['expense','income'].includes(c.type) || (c.parentId && !raw.categories.some(p => p.id === c.parentId && p.type === c.type)))) throw new Error('Некоректні категорії.');
    if (raw.transactions.some(t => !['income','expense','transfer'].includes(t.type) || !Number.isSafeInteger(t.amountKopecks) || t.amountKopecks <= 0 || !validDate(t.date) || typeof t.title !== 'string' || !t.title.trim() || !raw.accounts.some(a => a.id === t.accountId) || (t.type === 'transfer' ? !raw.accounts.some(a => a.id === t.toAccountId && a.id !== t.accountId) : !raw.categories.some(c => c.id === t.categoryId && c.type === t.type)) || !Array.isArray(t.tags))) throw new Error('Некоректні транзакції.');
    if (raw.budgets.some(b => !Number.isSafeInteger(b.limitKopecks) || b.limitKopecks <= 0 || !validDate(b.start) || !validDate(b.end) || b.start > b.end || (b.categoryId && !raw.categories.some(c => c.id === b.categoryId)))) throw new Error('Некоректні бюджети.');
    if (raw.goals.some(g => typeof g.name !== 'string' || !g.name.trim() || !Number.isSafeInteger(g.targetKopecks) || g.targetKopecks <= 0 || !Number.isSafeInteger(g.currentKopecks) || g.currentKopecks < 0)) throw new Error('Некоректні цілі.');
    if (raw.schedules.some(s => !['income','expense'].includes(s.type) || !['daily','weekly','monthly'].includes(s.recurrence) || !validDate(s.nextDate) || !Number.isSafeInteger(s.amountKopecks) || s.amountKopecks <= 0 || !raw.accounts.some(a => a.id === s.accountId) || !raw.categories.some(c => c.id === s.categoryId && c.type === s.type))) throw new Error('Некоректні заплановані операції.');
    if (raw.rules.some(r => typeof r.needle !== 'string' || !r.needle.trim() || !raw.categories.some(c => c.id === r.categoryId))) throw new Error('Некоректні правила.');
    return structuredClone(raw);
  }

  function accountBalance(state, accountId) {
    const account = state.accounts.find(a => a.id === accountId);
    if (!account) return null;
    return state.transactions.reduce((balance, t) => {
      if (t.type === 'income' && t.accountId === accountId) return balance + t.amountKopecks;
      if (t.type === 'expense' && t.accountId === accountId) return balance - t.amountKopecks;
      if (t.type === 'transfer' && t.accountId === accountId) return balance - t.amountKopecks;
      if (t.type === 'transfer' && t.toAccountId === accountId) return balance + t.amountKopecks;
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

  function filterTransactions(rows, filters = {}) {
    const query = String(filters.query || '').trim().toLocaleLowerCase('uk');
    const tag = String(filters.tag || '').trim().toLocaleLowerCase('uk');
    return rows.filter(t => (!query || `${t.title} ${t.note || ''}`.toLocaleLowerCase('uk').includes(query)) &&
      (!filters.type || t.type === filters.type) && (!filters.accountId || t.accountId === filters.accountId || t.toAccountId === filters.accountId) &&
      (!filters.categoryId || t.categoryId === filters.categoryId) && (!filters.start || t.date >= filters.start) && (!filters.end || t.date <= filters.end) &&
      (!filters.minKopecks || t.amountKopecks >= filters.minKopecks) && (!filters.maxKopecks || t.amountKopecks <= filters.maxKopecks) &&
      (!tag || (t.tags || []).some(value => value.toLocaleLowerCase('uk').includes(tag))));
  }

  function budgetSpent(budget, rows) {
    return rows.reduce((sum, t) => sum + (t.type === 'expense' && t.date >= budget.start && t.date <= budget.end && (!budget.categoryId || t.categoryId === budget.categoryId) ? t.amountKopecks : 0), 0);
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

  function transactionFingerprint(t) { return [t.date,t.type,t.accountId,t.toAccountId||'',t.amountKopecks,String(t.title).trim().toLocaleLowerCase('uk')].join('|'); }
  function mapCsvTransactions(rows, map, state) {
    const existing=new Set(state.transactions.map(transactionFingerprint)), pending=[], problems=[];
    rows.slice(1).forEach((row,index)=>{
      const get=key=>map[key]===''?'':String(row[Number(map[key])]??'').trim();
      const title=get('title'),amountKopecks=parseMoney(get('amount')),date=get('date');
      const rawType=get('type').toLocaleLowerCase('uk');
      const type=rawType==='дохід'||rawType==='income'?'income':rawType==='переказ'||rawType==='transfer'?'transfer':rawType===''||rawType==='витрата'||rawType==='expense'?'expense':null;
      const accountRaw=get('account'),categoryRaw=get('category'),destinationRaw=get('destination');
      const account=accountRaw?state.accounts.find(a=>a.name.toLocaleLowerCase('uk')===accountRaw.toLocaleLowerCase('uk')):state.accounts.find(a=>!a.archived);
      const destination=type==='transfer'?state.accounts.find(a=>a.name.toLocaleLowerCase('uk')===destinationRaw.toLocaleLowerCase('uk')):null;
      const category=type&&type!=='transfer'?(categoryRaw?state.categories.find(c=>c.type===type&&c.name.toLocaleLowerCase('uk')===categoryRaw.toLocaleLowerCase('uk')):state.categories.find(c=>c.type===type)):null;
      if(!title||!amountKopecks||!validDate(date)||!type||!account||(type==='transfer'?(!destination||destination.id===account.id):!category)){problems.push(index+2);return;}
      const item={title,type,amountKopecks,date,accountId:account.id,toAccountId:destination?.id||null,categoryId:category?.id||null,note:get('note'),tags:get('tags').split(/[;,]/).map(s=>s.trim()).filter(Boolean)};
      const fingerprint=transactionFingerprint(item);
      if(existing.has(fingerprint)){problems.push(index+2);return;}
      existing.add(fingerprint);pending.push(item);
    });
    return {pending,problems};
  }
  function csvCell(value) { let s=String(value??''); if (/^[\s]*[=+\-@]/.test(s)) s=`'${s}`; return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; }
  function toCSV(rows) { return rows.map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n'; }

  return { VERSION, DEFAULT_CATEGORIES, emptyState, parseMoney, parseNonnegativeMoney, validDate, migrateLegacy, addSampleExpenses, validateBackup,
    accountBalance, periodTotals, filterTransactions, budgetSpent, advanceDate, parseCSV, transactionFingerprint, mapCsvTransactions, toCSV };
});

