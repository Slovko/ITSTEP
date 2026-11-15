const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const pages={
  'index.html':'overview',
  'transactions.html':'transactions',
  'planning.html':'planning',
  'management.html':'management',
  'data.html':'data',
  'registration.html':'registration'
};
const nav=['index.html','transactions.html','planning.html','management.html','data.html','registration.html'];

test('each main section has a real page and working relative navigation',()=>{
  for(const [file,section] of Object.entries(pages)){
    const html=fs.readFileSync(path.join(__dirname,file),'utf8');
    assert(html.includes(`data-page="${section}"`),`${file} has wrong page identifier`);
    assert.match(html,new RegExp(`<section id="${section}"`),file);
    for(const target of nav) assert(html.includes(`href="${target}"`),`${file} lacks ${target}`);
    for(const asset of ['style.css','enhancements.css']) assert(html.includes(`href="${asset}"`),`${file} lacks ${asset}`);
    for(const asset of file==='registration.html' ? ['finance.js','script.js'] : ['finance.js','app.js']) assert(html.includes(`src="${asset}"`),`${file} lacks ${asset}`);
    assert.equal((html.match(/aria-current="page"/g)||[]).length,1,`${file} needs one active navigation item`);
    assert(!html.includes('href="#overview"'),`${file} has old scroll navigation`);
    for(const other of Object.values(pages).filter(x=>x!==section)) assert(!html.includes(`<section id="${other}"`),`${file} includes ${other}`);
  }
});

test('category detail has its own page and navigation',()=>{
  const html=fs.readFileSync(path.join(__dirname,'category.html'),'utf8');
  assert(html.includes('data-page="category"'));
  assert(html.includes('id="category-detail"'));
  assert(html.includes('id="category-transactions"'));
  assert(html.includes('href="management.html"'));
  for(const asset of ['style.css','enhancements.css','finance.js','app.js']) assert(html.includes(asset),`category page lacks ${asset}`);
});

test('currency controls exist where accounts, transfers, budgets and goals are edited',()=>{
  const read=name=>fs.readFileSync(path.join(__dirname,name),'utf8');
  const management=read('management.html'), transactions=read('transactions.html'), planning=read('planning.html');
  for(const id of ['account-type','account-currency']) assert(management.includes(`id="${id}"`));
  for(const id of ['transaction-to-amount','transfer-amount-field','transaction-amount-label']) assert(transactions.includes(`id="${id}"`));
  for(const id of ['budget-currency','goal-currency']) assert(planning.includes(`id="${id}"`));
  for(const currency of ['UAH','EUR','USD']) assert(management.includes(`value="${currency}"`));
});

test('page element IDs stay unique for form labels and scripts',()=>{
  for(const file of [...Object.keys(pages),'category.html']){
    const html=fs.readFileSync(path.join(__dirname,file),'utf8');
    const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
    assert.equal(new Set(ids).size,ids.length,`${file} has duplicate element IDs`);
  }
});
