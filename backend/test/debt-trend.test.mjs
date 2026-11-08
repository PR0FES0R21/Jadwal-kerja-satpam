import test from 'node:test';import assert from 'node:assert/strict';
import {debtTrend} from '../../lib/debt-trend.ts';import {loanAction,loanSummary} from '../../lib/loans.ts';import {financeAnalytics} from '../../lib/analytics.ts';import {financeView} from '../../lib/finance-view.ts';import {fixture} from './fixture.mjs';
const fields={title:'Galang',borrower:'Galang',platform:'SPinjam',principal:500,monthly:100,tenor:5,date:'2026-09-01',firstDue:'2026-10-01',notes:''},now='2026-11-01T10:00:00Z';
const pay=(id,date,amount,historical=true)=>({id,side:'platform',date,amount,allocations:[{number:1,amount}],historical,note:'',createdAt:now,createdBy:'qa',cancelled:false});
test('platform trend carries opening balances, groups same-day activity, and ignores receipts, voids and cancelled payments',()=>{
 let book=loanAction({revision:0,entries:[]},'loan_create','a',fields,'qa',now);
 book=loanAction(book,'loan_create','b',{...fields,ownerId:'self',borrower:'Saya',title:'Sendiri',date:'2026-10-14',firstDue:'2026-11-14'},'qa',now);
 book.loans[0].payments=[pay('old','2026-09-10',50),pay('paid','2026-10-10',25),{...pay('receipt','2026-10-10',25),side:'borrower'},{...pay('cancel','2026-10-20',20),cancelled:true}];
 book.loans[1].payments=[pay('same','2026-10-14',100)];
 const r=debtTrend(book,'2026-10-01','2026-10-31');assert.equal(r.opening,450);assert.equal(r.closing,825);assert.equal(r.added,500);assert.equal(r.paid,125);assert.equal(r.points.find(p=>p.date==='2026-10-14').activities.length,2);assert.equal(r.monthly[0].balance,825);
 assert.equal(r.closing,book.loans.reduce((n,l)=>n+loanSummary(l).platform,0));assert.equal(debtTrend(book,'2026-10-01','2026-10-31','self').closing,400);assert.equal(debtTrend(book,'2026-10-01','2026-10-31','a').closing,425);
 book.loans[0].archived=true;assert.equal(debtTrend(book,'2026-10-01','2026-10-31').closing,400);assert.throws(()=>debtTrend(book,'2026-10-01','2026-10-31','a'));
});
test('corrections restate installment obligations without creating recording-date spikes',()=>{
 const book=loanAction({revision:0,entries:[]},'loan_create','a',fields,'qa',now);book.loans[0].monthly=80;book.loans[0].history=[{at:now,by:'qa',action:'loan_edit',before:fields}];book.loans[0].payments=[pay('old','2026-09-10',50)];
 const r=debtTrend(book,'2026-09-01','2026-11-01');assert.equal(r.closing,350);assert.equal(r.points.at(-1).activities.length,0);assert.equal(r.monthly.length,3);assert.equal(r.monthly[2].balance,350);
});
test('multi-category and flow filters agree across graphs and paginated details',()=>{
 const date='2026-10-30',entries=Array.from({length:25},(_,i)=>({id:String(i),date,createdAt:now,type:i%2?'income':'expense',category:i%3?'Makan':'Minum',amount:100,cancelled:false}));entries.push({id:'other',date,createdAt:now,type:'expense',category:'Kos',amount:999,cancelled:false});
 const book={revision:0,entries},filter={from:date,to:date,account:'all',category:'Makan,Minum',type:'expense'},r=financeAnalytics(book,filter,'custom',date),v=financeView(book,new URLSearchParams({...filter,page:'2',scope:'cash'}));assert.equal(r.income,0);assert.equal(r.expense,1300);assert.equal(r.dailyTotal,1300);assert.equal(v.expense,r.expense);assert.equal(v.total,13);assert.equal(v.entries.length,3);assert.equal(r.months[0].expense,r.expense);
 assert.throws(()=>financeAnalytics(book,{...filter,type:'bogus'},'custom',date));
});
test('trend report is authenticated and person ids cannot expose another account',async()=>{
 const f=fixture(),a=await f.call('/auth/register',{username:'trendone',password:'password-12345'}),b=await f.call('/auth/register',{username:'trendtwo',password:'password-12345'}),user=await f.database.collection('users').findOne({username:'trendone'});
 const book=loanAction({revision:0,entries:[]},'loan_create','a',fields,'qa',now);await f.database.collection('finance').insertOne({_id:user._id,data:book});
 const path='/finance/report?from=2026-10-01&to=2026-10-31&owner=a&category=Makan,Minum&type=expense';assert.equal((await f.call(path,undefined,a.sessionToken)).report.debtTrend.closing,500);assert.equal((await f.call(path,undefined,b.sessionToken)).status,400);assert.equal((await f.call(path)).status,401);
});
