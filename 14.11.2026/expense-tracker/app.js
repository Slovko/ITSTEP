(() => {
  'use strict';
  const F = globalThis.Finance;
  const page = document.body.dataset.page;
  const KEY = 'my-finances-v2';
  const OLD_KEY = 'expense-tracker-v1';
  const $ = selector => document.querySelector(selector);
  const money = (value,currency='UAH') => new Intl.NumberFormat('uk-UA', { style:'currency', currency, minimumFractionDigits:2, maximumFractionDigits:2 }).format(value/100);
  const today = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const id = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const field = (form,name) => form.elements.namedItem(name);
  const value = (form,name) => field(form,name).value;
  const clean = text => String(text ?? '').trim();
  const dateMonth = date => date.slice(0,7);
  const firstOf = month => `${month}-01`;
  const lastOf = month => { const [y,m]=month.split('-').map(Number); return `${month}-${new Date(y,m,0).getDate().toString().padStart(2,'0')}`; };
  const previousMonth = month => { const [y,m]=month.split('-').map(Number); const d=new Date(y,m-2,1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; };
  let state;
  let selected = new Set();
  let csvRows = null;

  function notice(message, error=false) {
    const el=$('#app-message'); el.textContent=message; el.hidden=!message;
    el.classList.toggle('notice-error',error);
  }
  function load() {
    try {
      const saved=localStorage.getItem(KEY);
      if (saved) {
        const source=JSON.parse(saved);
        const loaded=F.validateBackup(source);
        const expanded=F.upgradeStarterCategories(loaded);
        const seeded=F.ensureSampleExpensesOnce(expanded,today());
        if (source.version!==loaded.version || loaded.settings.categoryCatalogVersion!==expanded.settings.categoryCatalogVersion || !loaded.settings.sampleExpensesVersion) {
          try { localStorage.setItem(KEY,JSON.stringify(seeded.state)); if(source.version!==loaded.version) notice('Старі дані збережено й оновлено. Усі попередні суми залишилися в UAH.'); }
          catch { notice('Оновлені дані показано, але не вдалося зберегти їх у браузері.',true); }
        }
        return seeded.state;
      }
      const legacy=localStorage.getItem(OLD_KEY);
      const migrated=F.migrateLegacy(legacy,today());
      const seeded=F.ensureSampleExpensesOnce(migrated,today()).state;
      if (legacy) {
        try { localStorage.setItem(KEY,JSON.stringify(seeded)); }
        catch { notice('Старі та прикладні витрати завантажено, але не вдалося зберегти новий формат.',true); return seeded; }
        notice(`Перенесено старі витрати: ${migrated.transactions.length}; додано приклади. Дати старих записів не зберігалися, тому їм призначено сьогоднішню дату.`);
        return seeded;
      }
      try { localStorage.setItem(KEY,JSON.stringify(seeded)); }
      catch { notice('Приклади показано, але не вдалося зберегти їх у браузері.',true); }
      return seeded;
    } catch (error) {
      notice(`Не вдалося прочитати збережені дані: ${error.message}. Наявні дані не змінено.`,true);
      return F.emptyState();
    }
  }
  state=load();
  function save() {
    try { localStorage.setItem(KEY,JSON.stringify(state)); return true; }
    catch { notice('Не вдалося зберегти зміни. Перевірте доступ до сховища браузера.',true); return false; }
  }
  function commit(message='') { const saved=save(); render(); if (saved && message) notice(message); }
  function option(value,label) { const el=document.createElement('option'); el.value=value; el.textContent=label; return el; }
  function setOptions(select, entries, placeholder) {
    const current=select.value;
    select.replaceChildren();
    if (placeholder !== undefined) select.append(option('',placeholder));
    for (const [v,label] of entries) select.append(option(v,label));
    if ([...select.options].some(o=>o.value===current)) select.value=current;
  }
  function accountName(accountId) { return state.accounts.find(a=>a.id===accountId)?.name || 'Невідомий рахунок'; }
  function accountCurrency(accountId) { return state.accounts.find(a=>a.id===accountId)?.currency || 'UAH'; }
  function accountLabel(account) { return `${account.name} · ${account.currency}`; }
  function transactionCurrency(transaction) { return accountCurrency(transaction.accountId); }
  function currencySums(rows) {
    const sums=Object.fromEntries(F.CURRENCIES.map(currency=>[currency,0]));
    for(const t of rows) sums[transactionCurrency(t)]+=t.amountKopecks;
    return sums;
  }
  function moneyLines(sums) { return F.CURRENCIES.map(currency=>money(sums[currency]||0,currency)).join('\n'); }
  function categoryName(categoryId) { return state.categories.find(c=>c.id===categoryId)?.name || 'Без категорії'; }
  function categoryLabel(category) { return category.parentId ? `${categoryName(category.parentId)} / ${category.name}` : category.name; }
  function paymentName(methodId) { return F.PAYMENT_METHODS.find(m=>m.id===methodId)?.name || 'Не вказано'; }
  function categoryLink(category) { const a=document.createElement('a'); a.href=F.categoryUrl(category.id); a.textContent=category.name; return a; }
  function activeAccounts() { return state.accounts.filter(a=>!a.archived); }
  function categories(type) { return state.categories.filter(c=>!type || c.type===type); }
  function button(label,onClick,className='secondary-button') { const el=document.createElement('button'); el.type='button'; el.className=className; el.textContent=label; el.addEventListener('click',onClick); return el; }
  function row(title,subtitle,actions=[]) { const el=document.createElement('div'); el.className='management-row'; const copy=document.createElement('div'); const strong=document.createElement('strong'); strong.textContent=title; const small=document.createElement('small'); small.textContent=subtitle; copy.append(strong,small); const group=document.createElement('div'); group.className='row-actions'; group.append(...actions); el.append(copy,group); return el; }
  function confirmation(message) { return window.confirm(message); }
  function error(formId,message) { $(`#${formId}-error`).textContent=message || ''; }
  function transactionError(name,message) { const input=$(`#transaction-${name}`), output=$(`#transaction-${name}-error`); input.setAttribute('aria-invalid',message?'true':'false'); output.textContent=message||''; }
  function clearTransactionErrors() { for(const name of ['title','amount','to-amount','date','account','destination','category','payment']) transactionError(name,''); }
  function exportFile(name,content,type) { const url=URL.createObjectURL(new Blob([content],{type})); const a=document.createElement('a'); a.href=url; a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); }

  function renderOptions() {
    const accountOptions=activeAccounts().map(a=>[a.id,accountLabel(a)]);
    if (page==='transactions') {
      for (const selector of ['#transaction-account','#transaction-destination']) setOptions($(selector),accountOptions);
      setOptions($('#filter-account'),state.accounts.map(a=>[a.id,accountLabel(a)]),'Усі рахунки');
      setOptions($('#filter-category'),state.categories.map(c=>[c.id,categoryLabel(c)]),'Усі категорії');
      setOptions($('#filter-payment'),[['unspecified','Не вказано'],...F.PAYMENT_METHODS.map(m=>[m.id,m.name])],'Усі способи');
      setOptions($('#transaction-payment'),F.PAYMENT_METHODS.map(m=>[m.id,m.name]),'Оберіть спосіб');
      updateTransactionFields();
    }
    if (page==='planning') {
      setOptions($('#schedule-account'),accountOptions);
      setOptions($('#schedule-payment'),F.PAYMENT_METHODS.map(m=>[m.id,m.name]),'Оберіть спосіб');
      setOptions($('#budget-category'),categories('expense').map(c=>[c.id,categoryLabel(c)]),'Усі витрати');
      setOptions($('#rule-category'),categories('expense').map(c=>[c.id,categoryLabel(c)]));
      updateScheduleFields();
    }
    if (page==='management') updateCategoryParent();
  }
  function updateTransactionFields() {
    const form=$('#transaction-form'), type=value(form,'type');
    $('#destination-field').hidden=type!=='transfer';
    $('#transaction-category-field').hidden=type==='transfer';
    if (type!=='transfer') setOptions(field(form,'categoryId'),categories(type).map(c=>[c.id,categoryLabel(c)]),'Оберіть категорію');
    if (type==='transfer' && !value(form,'paymentMethod')) field(form,'paymentMethod').value='bank_transfer';
    const sourceCurrency=accountCurrency(value(form,'accountId'));
    const destinationCurrency=accountCurrency(value(form,'toAccountId'));
    $('#transaction-amount-label').textContent=`Сума, ${sourceCurrency}`;
    const exchange=type==='transfer' && value(form,'toAccountId') && sourceCurrency!==destinationCurrency;
    $('#transfer-amount-field').hidden=!exchange;
    $('#transfer-amount-label').textContent=`Сума зарахування, ${destinationCurrency}`;
    if (!exchange) transactionError('to-amount','');
    updateTransferRate();
  }
  function updateTransferRate() {
    const from=F.parseMoney($('#transaction-amount').value), to=F.parseMoney($('#transaction-to-amount').value);
    const shown=!$('#transfer-amount-field').hidden && from && to;
    $('#transfer-rate').textContent=shown?`Курс цієї операції: 1 ${accountCurrency($('#transaction-account').value)} ≈ ${(to/from).toLocaleString('uk-UA',{maximumFractionDigits:4})} ${accountCurrency($('#transaction-destination').value)}.`:'';
  }
  function updateScheduleFields() {
    const form=$('#schedule-form');
    setOptions(field(form,'categoryId'),categories(value(form,'type')).map(c=>[c.id,categoryLabel(c)]),'Оберіть категорію');
  }
  function updateCategoryParent() {
    const form=$('#category-form'), type=value(form,'type'), editing=value(form,'id');
    setOptions(field(form,'parentId'),categories(type).filter(c=>c.id!==editing && !c.parentId).map(c=>[c.id,c.name]),'Немає');
  }
  function currentFilters() {
    return { query:$('#filter-query').value,type:$('#filter-type').value,accountId:$('#filter-account').value,
      categoryId:$('#filter-category').value,paymentMethod:$('#filter-payment').value,start:$('#filter-start').value,end:$('#filter-end').value,
      minKopecks:F.parseMoney($('#filter-min').value),maxKopecks:F.parseMoney($('#filter-max').value),tag:$('#filter-tag').value };
  }
  function visibleTransactions() {
    const rows=F.filterTransactions(state.transactions,currentFilters(),state.categories);
    const sort=$('#filter-sort').value;
    return rows.sort((a,b)=>sort==='oldest' ? a.date.localeCompare(b.date) : sort==='high' ? b.amountKopecks-a.amountKopecks : sort==='low' ? a.amountKopecks-b.amountKopecks : b.date.localeCompare(a.date));
  }
  function renderOverview() {
    const month=$('#overview-month').value || dateMonth(today()), start=firstOf(month), end=lastOf(month);
    const totals=F.totalsByCurrency(state,start,end);
    for(const [id,key] of [['#overview-expense','expense'],['#overview-income','income'],['#overview-net','net']]) $(id).textContent=moneyLines(Object.fromEntries(F.CURRENCIES.map(currency=>[currency,totals[currency][key]])));
    $('#overview-all-time-expense').textContent=moneyLines(F.allTimeExpenseTotals(state));
    const balances=Object.fromEntries(F.CURRENCIES.map(currency=>[currency,0]));
    for(const a of state.accounts) balances[a.currency]+=F.accountBalance(state,a.id);
    $('#overview-balance').textContent=moneyLines(balances);
    const prev=previousMonth(month), prevTotals=F.totalsByCurrency(state,firstOf(prev),lastOf(prev));
    $('#comparison').textContent=F.CURRENCIES.map(currency=>prevTotals[currency].expense ? `${currency}: витрати ${totals[currency].expense>=prevTotals[currency].expense?'зросли':'зменшилися'} на ${Math.abs(Math.round((totals[currency].expense-prevTotals[currency].expense)/prevTotals[currency].expense*100))}% проти ${prev}.` : `${currency}: за попередній місяць витрат немає.`).join('\n');
    const chart=$('#category-chart'); chart.replaceChildren();
    const expenses=state.transactions.filter(t=>t.type==='expense' && t.date>=start && t.date<=end);
    const roots=categories('expense').filter(c=>!c.parentId);
    const sums=F.CURRENCIES.flatMap(currency=>roots.map(c=>({category:c,currency,amount:expenses.filter(t=>transactionCurrency(t)===currency && F.isCategoryWithin(t.categoryId,c.id,state.categories)).reduce((sum,t)=>sum+t.amountKopecks,0)}))).filter(item=>item.amount>0).sort((a,b)=>F.CURRENCIES.indexOf(a.currency)-F.CURRENCIES.indexOf(b.currency) || b.amount-a.amount);
    if (!sums.length) chart.append(row('Немає витрат','Додайте витрату, щоб побачити розподіл.'));
    for (const item of sums) { const wrap=document.createElement('div'); wrap.className='chart-item'; const heading=document.createElement('div'); heading.className='category-row'; const name=categoryLink(item.category); const amount=document.createElement('strong'); amount.textContent=money(item.amount,item.currency); heading.append(name,amount); const bar=document.createElement('progress'); bar.max=Math.max(totals[item.currency].expense,1); bar.value=item.amount; bar.setAttribute('aria-label',`${item.category.name}: ${money(item.amount,item.currency)}`); wrap.append(heading,bar); chart.append(wrap); }
    const accounts=$('#account-summary'); accounts.replaceChildren();
    for (const a of state.accounts) accounts.append(row(accountLabel(a),`${a.archived?'Архів · ':''}${money(F.accountBalance(state,a.id),a.currency)}`));
  }
  function renderTransactions() {
    const categoryTotals=$('#category-totals'); categoryTotals.replaceChildren();
    for (const c of categories('expense').filter(item=>!item.parentId)) { const item=row(c.name,moneyLines(currencySums(state.transactions.filter(t=>t.type==='expense'&&F.isCategoryWithin(t.categoryId,c.id,state.categories))))); item.querySelector('strong').replaceWith(categoryLink(c)); categoryTotals.append(item); }
    const rows=visibleTransactions(), list=$('#transaction-list'); list.replaceChildren();
    $('#result-count').textContent=`Знайдено: ${rows.length}`;
    $('#empty-state').textContent=state.transactions.length ? 'За поточними фільтрами операцій немає.' : 'Поки немає операцій. Додайте першу вище.';
    $('#empty-state').hidden=rows.length>0;
    $('#clear-all').disabled=!state.transactions.some(t=>t.type==='expense');
    $('#delete-selected').disabled=!selected.size;
    for (const t of rows) {
      const li=document.createElement('li'); li.className='expense-item transaction-item';
      const check=document.createElement('input'); check.type='checkbox'; check.checked=selected.has(t.id); check.setAttribute('aria-label',`Вибрати «${t.title}»`); check.addEventListener('change',()=>{ if(check.checked) selected.add(t.id); else selected.delete(t.id); $('#delete-selected').disabled=!selected.size; });
      const details=document.createElement('div'); details.className='expense-details'; const title=document.createElement('strong'); title.textContent=t.title; const meta=document.createElement('span'); meta.textContent=`${t.date} · ${t.type==='expense'?'Витрата':t.type==='income'?'Дохід':'Переказ'} · ${accountLabel(state.accounts.find(a=>a.id===t.accountId))}${t.type==='transfer'?' → '+accountLabel(state.accounts.find(a=>a.id===t.toAccountId)):''} · ${paymentName(t.paymentMethod)}${t.tags?.length?' · '+t.tags.join(', '):''}`; details.append(title,meta); if(t.categoryId){ const c=state.categories.find(x=>x.id===t.categoryId); if(c?.type==='expense') details.append(categoryLink(c)); else if(c){ const label=document.createElement('span'); label.textContent=c.name; details.append(label); } }
      const amount=document.createElement('strong'); amount.className='expense-amount'; amount.textContent=t.type==='transfer'?`${money(t.amountKopecks,transactionCurrency(t))} → ${money(t.toAmountKopecks??t.amountKopecks,accountCurrency(t.toAccountId))}`:(t.type==='expense'?'−':'+')+money(t.amountKopecks,transactionCurrency(t));
      const actions=document.createElement('div'); actions.className='row-actions'; actions.append(button('Змінити',()=>editTransaction(t)),button('Копія',()=>duplicateTransaction(t)),button('Видалити',()=>{ if(confirmation(`Видалити операцію «${t.title}»?`)){ state.transactions=state.transactions.filter(x=>x.id!==t.id); selected.delete(t.id); commit('Операцію видалено.'); } },'remove-button'));
      li.append(check,details,amount,actions); list.append(li);
    }
  }
  function renderManagement() {
    const accounts=$('#accounts-list'); accounts.replaceChildren();
    for(const a of state.accounts) accounts.append(row(accountLabel(a),`${a.type==='cash'?'Готівка':'Банк / картка'} · ${money(F.accountBalance(state,a.id),a.currency)}${a.archived?' · архів':''}`,[button('Змінити',()=>{ const f=$('#account-form'); field(f,'id').value=a.id; field(f,'name').value=a.name; field(f,'type').value=a.type; field(f,'currency').value=a.currency; field(f,'currency').disabled=a.openingKopecks>0||state.transactions.some(t=>t.accountId===a.id||t.toAccountId===a.id)||state.schedules.some(s=>s.accountId===a.id); field(f,'opening').value=(a.openingKopecks/100).toFixed(2); f.scrollIntoView({behavior:'smooth'}); }),button(a.archived?'Відновити':'Архівувати',()=>{ if(!a.archived && activeAccounts().length===1){ error('account','Потрібен хоча б один активний рахунок.'); return; } a.archived=!a.archived; commit(); }),button('Видалити',()=>{ if(state.accounts.length===1 || (!a.archived && activeAccounts().length===1) || state.transactions.some(t=>t.accountId===a.id||t.toAccountId===a.id) || state.schedules.some(s=>s.accountId===a.id)){ error('account','Цей рахунок не можна видалити: він потрібен для операцій або є єдиним активним.'); return; } if(confirmation(`Видалити рахунок «${a.name}»?`)){ state.accounts=state.accounts.filter(x=>x.id!==a.id); commit(); } },'remove-button')]));
    const cats=$('#categories-list'); cats.replaceChildren();
    for(const c of state.categories) { const item=row(c.name,`${c.type==='expense'?'Витрата':'Дохід'}${c.parentId?' · підкатегорія '+categoryName(c.parentId):''}`,[button('Змінити',()=>{ const f=$('#category-form'); field(f,'id').value=c.id; field(f,'name').value=c.name; field(f,'type').value=c.type; updateCategoryParent(); field(f,'parentId').value=c.parentId||''; f.scrollIntoView({behavior:'smooth'}); }),button('Видалити',()=>{ if(state.transactions.some(t=>t.categoryId===c.id)||state.categories.some(x=>x.parentId===c.id)||state.budgets.some(b=>b.categoryId===c.id)||state.schedules.some(s=>s.categoryId===c.id)||state.rules.some(r=>r.categoryId===c.id)){ error('category','Категорія використовується. Спершу зміни пов’язані записи.'); return; } if(confirmation(`Видалити категорію «${c.name}»?`)){ state.categories=state.categories.filter(x=>x.id!==c.id); commit(); } },'remove-button')]); if(c.type==='expense') item.querySelector('strong').replaceWith(categoryLink(c)); cats.append(item); }
  }
  function renderPlanning() {
    const budgets=$('#budgets-list'); budgets.replaceChildren();
    for(const b of state.budgets) { const spent=F.budgetSpent(b,state.transactions,state.categories,state.accounts), pct=Math.round(spent/b.limitKopecks*100); const item=row(b.name,`${b.start} — ${b.end} · ${b.categoryId?categoryName(b.categoryId):'Усі витрати'} · ${money(spent,b.currency)} з ${money(b.limitKopecks,b.currency)} · залишок ${money(b.limitKopecks-spent,b.currency)} · ${pct}%${pct>=100?' · Ліміт перевищено':''}`,[button('Змінити',()=>fillBudget(b)),button('Видалити',()=>{ if(confirmation(`Видалити бюджет «${b.name}»?`)){ state.budgets=state.budgets.filter(x=>x.id!==b.id); commit(); } },'remove-button')]); item.classList.toggle('over-budget',pct>=100); budgets.append(item); }
    const goals=$('#goals-list'); goals.replaceChildren();
    for(const g of state.goals) goals.append(row(g.name,`${money(g.currentKopecks,g.currency)} з ${money(g.targetKopecks,g.currency)} · залишилося ${money(Math.max(0,g.targetKopecks-g.currentKopecks),g.currency)} · ${Math.round(g.currentKopecks/g.targetKopecks*100)}%`,[button('Змінити',()=>fillGoal(g)),button('Видалити',()=>{ if(confirmation(`Видалити ціль «${g.name}»?`)){ state.goals=state.goals.filter(x=>x.id!==g.id); commit(); } },'remove-button')]));
    const schedules=$('#schedules-list'); schedules.replaceChildren();
    for(const s of state.schedules) schedules.append(row(s.title,`${money(s.amountKopecks,accountCurrency(s.accountId))} · ${s.nextDate} · ${s.recurrence==='monthly'?'щомісяця':s.recurrence==='weekly'?'щотижня':'щодня'}`,[button('Підтвердити',()=>runSchedule(s,true)),button('Пропустити',()=>runSchedule(s,false)),button('Змінити',()=>fillSchedule(s)),button('Видалити',()=>{ if(confirmation(`Видалити правило «${s.title}»?`)){ state.schedules=state.schedules.filter(x=>x.id!==s.id); commit(); } },'remove-button')]));
    const rules=$('#rules-list'); rules.replaceChildren();
    for(const r of state.rules) rules.append(row(r.needle,`${categoryName(r.categoryId)} · ${r.enabled?'увімкнено':'вимкнено'}`,[button(r.enabled?'Вимкнути':'Увімкнути',()=>{ r.enabled=!r.enabled; commit(); }),button('Змінити',()=>fillRule(r)),button('Видалити',()=>{ state.rules=state.rules.filter(x=>x.id!==r.id); commit(); },'remove-button')]));
  }
  function renderCategory() {
    const categoryId=new URLSearchParams(location.search).get('id');
    const category=state.categories.find(c=>c.id===categoryId && c.type==='expense');
    $('#category-error').hidden=!!category;
    $('#category-view').hidden=!category;
    if (!category) { document.title='Категорію не знайдено — Мої фінанси'; return; }
    document.title=`${category.name} — Мої фінанси`;
    $('#category-title').textContent=category.name;
    const month=$('#category-month').value || dateMonth(today()), start=firstOf(month), end=lastOf(month);
    const all=state.transactions.filter(t=>t.type==='expense' && F.isCategoryWithin(t.categoryId,category.id,state.categories));
    const period=all.filter(t=>t.date>=start && t.date<=end).sort((a,b)=>b.date.localeCompare(a.date));
    $('#category-period-total').textContent=moneyLines(currencySums(period));
    $('#category-all-total').textContent=moneyLines(currencySums(all));
    $('#category-count').textContent=String(period.length);
    const budgets=$('#category-budgets'); budgets.replaceChildren();
    const related=state.budgets.filter(b=>b.categoryId && F.isCategoryWithin(category.id,b.categoryId,state.categories));
    if (!related.length) budgets.append(row('Бюджету немає','Створи бюджет у розділі «Планування».'));
    for (const b of related) budgets.append(row(b.name,`${money(F.budgetSpent(b,state.transactions,state.categories,state.accounts),b.currency)} із ${money(b.limitKopecks,b.currency)} · ${b.start} — ${b.end}`));
    const children=$('#category-children'); children.replaceChildren();
    const subcategories=state.categories.filter(c=>c.parentId===category.id && c.type==='expense');
    if (!subcategories.length) children.append(row('Підкатегорій немає','Це окрема категорія.'));
    for (const child of subcategories) { const item=row(child.name,moneyLines(currencySums(all.filter(t=>F.isCategoryWithin(t.categoryId,child.id,state.categories))))); item.querySelector('strong').replaceWith(categoryLink(child)); children.append(item); }
    const list=$('#category-transactions'); list.replaceChildren();
    $('#category-empty').hidden=period.length>0;
    for (const t of period) { const li=document.createElement('li'); li.append(row(t.title,`${t.date} · ${paymentName(t.paymentMethod)} · ${money(t.amountKopecks,transactionCurrency(t))}`)); list.append(li); }
  }
  function render() {
    document.documentElement.dataset.theme=state.settings.theme;
    if (page==='overview') renderOverview();
    if (page==='transactions') { renderOptions(); renderTransactions(); }
    if (page==='management') { renderOptions(); renderManagement(); }
    if (page==='planning') { renderOptions(); renderPlanning(); }
    if (page==='category') renderCategory();
    if (page==='data') $('#dark-theme').checked=state.settings.theme==='dark';
  }

  function editTransaction(t) {
    const f=$('#transaction-form'); field(f,'id').value=t.id; field(f,'type').value=t.type; updateTransactionFields();
    for(const [key,v] of Object.entries({title:t.title,amount:(t.amountKopecks/100).toFixed(2),toAmount:t.type==='transfer'?((t.toAmountKopecks??t.amountKopecks)/100).toFixed(2):'',date:t.date,accountId:t.accountId,toAccountId:t.toAccountId||'',categoryId:t.categoryId||'',paymentMethod:t.paymentMethod||'',note:t.note||'',tags:(t.tags||[]).join(', ')})) field(f,key).value=v;
    updateTransactionFields();
    $('#transaction-form-title').textContent='Редагувати операцію'; $('#transaction-submit').textContent='Зберегти зміни'; $('#transaction-cancel').hidden=false; f.scrollIntoView({behavior:'smooth'});
  }
  function duplicateTransaction(t) { editTransaction({...t,id:'',date:today()}); $('#transaction-form-title').textContent='Копія операції'; $('#transaction-submit').textContent='Додати копію'; }
  function resetTransaction() { const f=$('#transaction-form'); f.reset(); field(f,'id').value=''; field(f,'date').value=today(); $('#transaction-form-title').textContent='Нова операція'; $('#transaction-submit').textContent='Додати операцію'; $('#transaction-cancel').hidden=true; error('transaction-form',''); clearTransactionErrors(); updateTransactionFields(); }
  function fillBudget(b) { const f=$('#budget-form'); for(const [k,v] of Object.entries({id:b.id,name:b.name,limit:(b.limitKopecks/100).toFixed(2),currency:b.currency,categoryId:b.categoryId||'',start:b.start,end:b.end})) field(f,k).value=v; f.scrollIntoView({behavior:'smooth'}); }
  function fillGoal(g) { const f=$('#goal-form'); for(const [k,v] of Object.entries({id:g.id,name:g.name,target:(g.targetKopecks/100).toFixed(2),current:(g.currentKopecks/100).toFixed(2),currency:g.currency})) field(f,k).value=v; field(f,'currency').disabled=g.currentKopecks>0; f.scrollIntoView({behavior:'smooth'}); }
  function fillSchedule(s) { const f=$('#schedule-form'); for(const [k,v] of Object.entries({id:s.id,title:s.title,amount:(s.amountKopecks/100).toFixed(2),type:s.type,recurrence:s.recurrence,accountId:s.accountId,paymentMethod:s.paymentMethod||'',nextDate:s.nextDate})) field(f,k).value=v; updateScheduleFields(); field(f,'categoryId').value=s.categoryId; f.scrollIntoView({behavior:'smooth'}); }
  function fillRule(r) { const f=$('#rule-form'); field(f,'id').value=r.id; field(f,'needle').value=r.needle; field(f,'categoryId').value=r.categoryId; f.scrollIntoView({behavior:'smooth'}); }
  function runSchedule(s,confirm) { if(confirm) state.transactions.unshift({id:id(),title:s.title,type:s.type,amountKopecks:s.amountKopecks,accountId:s.accountId,toAccountId:null,categoryId:s.categoryId,paymentMethod:s.paymentMethod||null,date:s.nextDate,note:'Створено із регулярної операції',tags:[]}); s.nextDate=F.advanceDate(s.nextDate,s.recurrence,s.anchorDay); commit(confirm?'Заплановану операцію додано.':'Заплановану операцію пропущено.'); }

  if (page==='overview') { $('#overview-month').value=dateMonth(today()); $('#overview-month').addEventListener('change',renderOverview); }
  if (page==='category') { $('#category-month').value=dateMonth(today()); $('#category-month').addEventListener('change',renderCategory); }
  if (page==='transactions') {
  $('#transaction-date').value=today();
  $('#transaction-type').addEventListener('change',updateTransactionFields);
  $('#transaction-account').addEventListener('change',updateTransactionFields);
  $('#transaction-destination').addEventListener('change',updateTransactionFields);
  $('#transaction-amount').addEventListener('input',updateTransferRate);
  $('#transaction-to-amount').addEventListener('input',updateTransferRate);
  $('#transaction-cancel').addEventListener('click',resetTransaction);
  for(const name of ['title','amount','to-amount','date','account','destination','category','payment']) $(`#transaction-${name}`).addEventListener('input',()=>transactionError(name,''));
  $('#transaction-title').addEventListener('input',() => {
    const form=$('#transaction-form'), type=value(form,'type'); if(type==='transfer') return;
    const rule=state.rules.find(r=>r.enabled && state.categories.find(c=>c.id===r.categoryId)?.type===type && clean(value(form,'title')).toLocaleLowerCase('uk').includes(r.needle.toLocaleLowerCase('uk')));
    if(rule) field(form,'categoryId').value=rule.categoryId;
  });

  $('#transaction-form').addEventListener('submit',event => {
    event.preventDefault(); const f=event.currentTarget;
    const type=value(f,'type'), amountKopecks=F.parseMoney(value(f,'amount')),
      title=clean(value(f,'title')), date=value(f,'date'), accountId=value(f,'accountId'),
      toAccountId=value(f,'toAccountId'), categoryId=value(f,'categoryId'), paymentMethod=value(f,'paymentMethod');
    const exchange=type==='transfer' && activeAccounts().some(a=>a.id===toAccountId) && accountCurrency(accountId)!==accountCurrency(toAccountId);
    const toAmountKopecks=type==='transfer'?(exchange?F.parseMoney(value(f,'toAmount')):amountKopecks):null;
    const errors={title:!title?'Введіть назву операції.':'',amount:!amountKopecks?'Введіть додатну суму з не більш ніж двома знаками після коми.':'','to-amount':exchange&&!toAmountKopecks?'Введи додатну суму зарахування у валюті рахунку отримувача.':'',date:!F.validDate(date)?'Оберіть коректну дату.':'',account:!activeAccounts().some(a=>a.id===accountId)?'Оберіть активний рахунок.':'',destination:type==='transfer'&&(!activeAccounts().some(a=>a.id===toAccountId)||toAccountId===accountId)?'Оберіть інший активний рахунок отримувача.':'',category:type!=='transfer'&&!categories(type).some(c=>c.id===categoryId)?'Оберіть категорію відповідного типу.':'',payment:!F.PAYMENT_METHODS.some(m=>m.id===paymentMethod)?'Оберіть спосіб розрахунку.':''};
    for(const [name,message] of Object.entries(errors)) transactionError(name,message);
    const first=Object.keys(errors).find(name=>errors[name]);
    error('transaction-form',first?'Виправте помилки у формі.':''); if(first){ $(`#transaction-${first}`).focus(); return; }
    const transaction={id:value(f,'id')||id(),title,type,amountKopecks,toAmountKopecks,date,accountId,toAccountId:type==='transfer'?toAccountId:null,categoryId:type==='transfer'?null:categoryId,paymentMethod,note:clean(value(f,'note')),tags:value(f,'tags').split(',').map(clean).filter(Boolean).slice(0,10)};
    const index=state.transactions.findIndex(t=>t.id===transaction.id);
    if(index>=0) state.transactions[index]=transaction; else state.transactions.unshift(transaction);
    resetTransaction(); commit('Операцію збережено.');
  });
  for(const selector of ['#filter-query','#filter-type','#filter-account','#filter-payment','#filter-category','#filter-start','#filter-end','#filter-min','#filter-max','#filter-tag','#filter-sort']) $(selector).addEventListener('input',renderTransactions);
  $('#select-visible').addEventListener('click',()=>{ for(const t of visibleTransactions()) selected.add(t.id); renderTransactions(); });
  $('#delete-selected').addEventListener('click',()=>{ if(!selected.size || !confirmation(`Видалити вибрані операції (${selected.size})?`)) return; state.transactions=state.transactions.filter(t=>!selected.has(t.id)); selected.clear(); commit('Вибрані операції видалено.'); });
  $('#clear-all').addEventListener('click',()=>{ if(!confirmation('Видалити всі витрати? Доходи й перекази залишаться.')) return; state.transactions=state.transactions.filter(t=>t.type!=='expense'); selected.clear(); commit('Усі витрати видалено.'); });

  }
  if (page==='management') {
  $('#category-type').addEventListener('change',updateCategoryParent);

  $('#account-form').addEventListener('submit',event=>{ event.preventDefault(); const f=event.currentTarget, name=clean(value(f,'name')), openingKopecks=F.parseNonnegativeMoney(value(f,'opening')), accountId=value(f,'id'), type=value(f,'type'), currency=value(f,'currency'), existing=state.accounts.find(a=>a.id===accountId);
    const currencyLocked=existing&&(existing.openingKopecks>0||state.transactions.some(t=>t.accountId===accountId||t.toAccountId===accountId)||state.schedules.some(s=>s.accountId===accountId));
    const message=!name?'Введіть назву рахунку.':!F.ACCOUNT_TYPES.includes(type)?'Оберіть тип рахунку.':!F.CURRENCIES.includes(currency)?'Оберіть валюту.':currencyLocked&&currency!==existing.currency?'Валюту рахунку з балансом або операціями не можна змінити. Створи новий рахунок і переказ.':openingKopecks===null?'Введіть коректний початковий баланс.':state.accounts.some(a=>a.name.toLocaleLowerCase('uk')===name.toLocaleLowerCase('uk')&&a.currency===currency&&a.id!==accountId)?'Рахунок із такою назвою та валютою вже є.':'';
    error('account',message); if(message) return;
    if(accountId){ const a=state.accounts.find(x=>x.id===accountId); if(!a) return; Object.assign(a,{name,type,currency,openingKopecks}); }
    else state.accounts.push({id:id(),name,type,currency,openingKopecks,archived:false});
    f.reset(); field(f,'currency').disabled=false; field(f,'id').value=''; commit('Рахунок збережено.');
  });
  $('#account-form').addEventListener('reset',()=>{ error('account',''); setTimeout(()=>{ field($('#account-form'),'currency').disabled=false; field($('#account-form'),'id').value=''; },0); });
  $('#category-form').addEventListener('submit',event=>{ event.preventDefault(); const f=event.currentTarget, categoryId=value(f,'id'), name=clean(value(f,'name')), type=value(f,'type'), parentId=value(f,'parentId')||null;
    const used=state.transactions.some(t=>t.categoryId===categoryId)||state.schedules.some(s=>s.categoryId===categoryId)||state.budgets.some(b=>b.categoryId===categoryId)||state.rules.some(r=>r.categoryId===categoryId)||state.categories.some(c=>c.parentId===categoryId);
    const old=state.categories.find(c=>c.id===categoryId);
    const message=!name?'Введіть назву категорії.':state.categories.some(c=>c.name.toLocaleLowerCase('uk')===name.toLocaleLowerCase('uk')&&c.type===type&&c.id!==categoryId)?'Категорія з такою назвою вже є.':old&&old.type!==type&&used?'Не можна змінити тип категорії, яка використовується.':parentId&&(!state.categories.some(c=>c.id===parentId&&c.type===type)||state.categories.some(c=>c.parentId===categoryId))?'Некоректна батьківська категорія.':'';
    error('category',message); if(message) return;
    if(old) Object.assign(old,{name,type,parentId}); else state.categories.push({id:id(),name,type,parentId});
    f.reset(); commit('Категорію збережено.');
  });
  $('#category-form').addEventListener('reset',()=>{ error('category',''); setTimeout(updateCategoryParent,0); });

  }
  if (page==='planning') {
  $('#schedule-date').value=today();
  $('#budget-start').value=firstOf(dateMonth(today()));
  $('#budget-end').value=lastOf(dateMonth(today()));
  $('#schedule-type').addEventListener('change',updateScheduleFields);

  $('#budget-form').addEventListener('submit',event=>{ event.preventDefault(); const f=event.currentTarget, name=clean(value(f,'name')), limitKopecks=F.parseMoney(value(f,'limit')), currency=value(f,'currency'), start=value(f,'start'), end=value(f,'end'), categoryId=value(f,'categoryId')||null;
    const message=!name?'Введіть назву бюджету.':!limitKopecks?'Введіть додатний ліміт.':!F.CURRENCIES.includes(currency)?'Оберіть валюту бюджету.':!F.validDate(start)||!F.validDate(end)||start>end?'Оберіть коректний період.':categoryId&&!categories('expense').some(c=>c.id===categoryId)?'Оберіть категорію витрат.':'';
    error('budget',message); if(message) return;
    const budget={id:value(f,'id')||id(),name,limitKopecks,currency,start,end,categoryId}; const index=state.budgets.findIndex(b=>b.id===budget.id); if(index>=0) state.budgets[index]=budget; else state.budgets.push(budget); f.reset(); field(f,'start').value=firstOf(dateMonth(today())); field(f,'end').value=lastOf(dateMonth(today())); commit('Бюджет збережено.');
  });
  $('#goal-form').addEventListener('submit',event=>{ event.preventDefault(); const f=event.currentTarget,name=clean(value(f,'name')),targetKopecks=F.parseMoney(value(f,'target')),currentKopecks=F.parseNonnegativeMoney(value(f,'current')),currency=value(f,'currency'),old=state.goals.find(g=>g.id===value(f,'id'));
    const message=!name?'Введіть назву цілі.':!targetKopecks?'Введіть додатну цільову суму.':currentKopecks===null?'Введіть коректну накопичену суму.':!F.CURRENCIES.includes(currency)?'Оберіть валюту цілі.':old&&old.currentKopecks>0&&old.currency!==currency?'Валюту цілі з накопиченою сумою не можна змінити. Створи нову ціль.':''; error('goal',message); if(message) return;
    const goal={id:value(f,'id')||id(),name,targetKopecks,currentKopecks,currency}; const index=state.goals.findIndex(g=>g.id===goal.id); if(index>=0) state.goals[index]=goal; else state.goals.push(goal); f.reset(); field(f,'currency').disabled=false; field(f,'id').value=''; commit('Ціль збережено.');
  });
  $('#goal-form').addEventListener('reset',()=>setTimeout(()=>{ field($('#goal-form'),'currency').disabled=false; field($('#goal-form'),'id').value=''; },0));
  $('#schedule-form').addEventListener('submit',event=>{ event.preventDefault(); const f=event.currentTarget,title=clean(value(f,'title')),amountKopecks=F.parseMoney(value(f,'amount')),type=value(f,'type'),recurrence=value(f,'recurrence'),accountId=value(f,'accountId'),categoryId=value(f,'categoryId'),paymentMethod=value(f,'paymentMethod'),nextDate=value(f,'nextDate');
    const message=!title?'Введіть назву.':!amountKopecks?'Введіть додатну суму.':!F.validDate(nextDate)?'Оберіть коректну дату.':!activeAccounts().some(a=>a.id===accountId)?'Оберіть активний рахунок.':!categories(type).some(c=>c.id===categoryId)?'Оберіть категорію.':!F.PAYMENT_METHODS.some(m=>m.id===paymentMethod)?'Оберіть спосіб розрахунку.':''; error('schedule',message); if(message) return;
    const schedule={id:value(f,'id')||id(),title,amountKopecks,type,recurrence,accountId,categoryId,paymentMethod,nextDate,anchorDay:Number(nextDate.slice(-2))}; const index=state.schedules.findIndex(s=>s.id===schedule.id); if(index>=0) state.schedules[index]=schedule; else state.schedules.push(schedule); f.reset(); field(f,'nextDate').value=today(); commit('Регулярну операцію збережено.');
  });
  $('#rule-form').addEventListener('submit',event=>{ event.preventDefault(); const f=event.currentTarget,needle=clean(value(f,'needle')),categoryId=value(f,'categoryId');
    const message=!needle?'Введіть слово для пошуку.':!categories('expense').some(c=>c.id===categoryId)?'Оберіть категорію витрат.':''; error('rule',message); if(message) return;
    const rule={id:value(f,'id')||id(),needle,categoryId,enabled:true}; const index=state.rules.findIndex(r=>r.id===rule.id); if(index>=0) state.rules[index]={...state.rules[index],needle,categoryId}; else state.rules.push(rule); f.reset(); commit('Правило збережено.');
  });

  }
  if (page==='data') {

  $('#export-json').addEventListener('click',()=>exportFile(`moi-finansy-${today()}.json`,JSON.stringify(state,null,2),'application/json;charset=utf-8'));
  $('#export-csv').addEventListener('click',()=>{ const rows=[['Дата','Тип','Назва','Сума','Валюта','Рахунок','Рахунок отримувача','Валюта отримувача','Сума зарахування','Категорія','Спосіб розрахунку','Нотатка','Теги']]; for(const t of state.transactions) rows.push([t.date,t.type,t.title,(t.amountKopecks/100).toFixed(2),transactionCurrency(t),accountName(t.accountId),t.toAccountId?accountName(t.toAccountId):'',t.toAccountId?accountCurrency(t.toAccountId):'',t.type==='transfer'?((t.toAmountKopecks??t.amountKopecks)/100).toFixed(2):'',t.categoryId?categoryName(t.categoryId):'',t.paymentMethod?paymentName(t.paymentMethod):'',t.note||'',(t.tags||[]).join('; ')]); exportFile(`operatsii-${today()}.csv`,'\uFEFF'+F.toCSV(rows),'text/csv;charset=utf-8'); });
  $('#restore-json').addEventListener('click',async()=>{ const file=$('#backup-file').files[0]; if(!file){ notice('Оберіть файл JSON.',true); return; } try { const restored=F.validateBackup(JSON.parse(await file.text())); if(!confirmation(`Замінити поточні дані копією? У ній ${restored.transactions.length} операцій. Спочатку експортуйте поточні дані, якщо хочете їх зберегти.`)) return; state=F.ensureSampleExpensesOnce(F.upgradeStarterCategories(restored),today()).state; selected.clear(); commit('Резервну копію відновлено.'); } catch(e){ notice(`Не вдалося відновити дані: ${e.message}`,true); } });

  const mappingFields=[['title','Назва'],['amount','Сума'],['currency','Валюта'],['type','Тип'],['date','Дата'],['account','Рахунок'],['destination','Рахунок отримувача'],['destinationCurrency','Валюта отримувача'],['toAmount','Сума зарахування'],['category','Категорія'],['paymentMethod','Спосіб розрахунку'],['note','Нотатка'],['tags','Теги']];
  $('#csv-file').addEventListener('change',async()=>{ const file=$('#csv-file').files[0]; if(!file){ $('#csv-mapping').hidden=true; return; } try { csvRows=F.parseCSV(await file.text()); if(csvRows.length<2) throw new Error('У файлі немає рядків для імпорту.'); const columns=$('#csv-columns'); columns.replaceChildren(); const headers=csvRows[0]; for(const [key,label] of mappingFields){ const wrap=document.createElement('div'); wrap.className='field'; const title=document.createElement('label'); title.htmlFor=`csv-${key}`; title.textContent=label; const select=document.createElement('select'); select.id=`csv-${key}`; select.append(option('','Не імпортувати')); headers.forEach((h,i)=>select.append(option(String(i),h||`Колонка ${i+1}`))); const exact=headers.findIndex(h=>h.trim().toLocaleLowerCase('uk')===label.toLocaleLowerCase('uk')); if(exact>=0) select.value=String(exact); wrap.append(title,select); columns.append(wrap); } $('#csv-preview').textContent=`Рядків у файлі: ${csvRows.length-1}. Перший: ${csvRows[1].join(' · ')}`; $('#csv-mapping').hidden=false; notice('CSV прочитано. Перевірте відповідність стовпців перед імпортом.'); } catch(e){ csvRows=null; $('#csv-mapping').hidden=true; notice(`Помилка CSV: ${e.message}`,true); } });
  $('#import-csv').addEventListener('click',()=>{
    if(!csvRows) return;
    const map=Object.fromEntries(mappingFields.map(([key])=>[key,$(`#csv-${key}`).value]));
    if(['title','amount','date'].some(key=>map[key]==='')) { notice('Зіставте обов’язкові стовпці: назва, сума, дата.',true); return; }
    const {pending,problems}=F.mapCsvTransactions(csvRows,map,state);
    if(!pending.length){ notice(`Немає придатних нових рядків. Пропущено: ${problems.join(', ')||'усі'}.`,true); return; }
    if(!confirmation(`Імпортувати ${pending.length} операцій? Пропущені або повторні рядки: ${problems.length}${problems.length?' ('+problems.slice(0,15).join(', ')+')':''}.`)) return;
    state.transactions.unshift(...pending.map(item=>({id:id(),...item})));
    commit(`Імпортовано ${pending.length} операцій. Пропущено: ${problems.length}${problems.length?' (рядки '+problems.join(', ')+')':''}.`);
  });
  $('#dark-theme').addEventListener('change',event=>{ state.settings.theme=event.target.checked?'dark':'light'; commit(); });
  }
  render();
})();
