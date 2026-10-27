import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {loanAction,installments,loanSummary,dueDate} from '../../lib/loans.ts';
import {accountBalance,walletAction} from '../../lib/finance.ts';
import {fixture} from './fixture.mjs';
const now='2026-10-27T05:00:00Z',fields={title:'SPinjam Galang',borrower:'Galang',platform:'SPinjam',principal:500000,monthly:100000,tenor:5,date:'2026-10-01',firstDue:'2026-11-01',notes:''};
const opening={amount:269175,date:'2026-10-01',excludedEntryIds:[]};
const base=()=>loanAction({revision:0,opening,entries:[],accounts:[{id:'shopee',name:'ShopeePay',kind:'ewallet',opening:{...opening,amount:0}}]},'loan_create','loan',fields,'alice',now);
const payment=(side,accountId,allocations,extra={})=>({loanId:'loan',side,accountId,allocations,date:'2026-10-27',historical:false,note:'',...extra});
test('independent borrower/platform installments and different wallets preserve shortfall until later receipts',()=>{
 let b=base();assert.equal(b.entries.length,0);assert.equal(installments(b.loans[0]).length,5);
 b=loanAction(b,'loan_pay','received',payment('borrower','shopee',[{number:1,amount:60000}]),'alice',now);
 b=loanAction(b,'loan_pay','paid',payment('platform','mandiri',[{number:1,amount:100000},{number:2,amount:100000}]),'alice',now);
 assert.equal(accountBalance(b,'mandiri').current,69175);assert.equal(accountBalance(b,'shopee').current,60000);
 let s=loanSummary(b.loans[0]);assert.equal(s.borrower,440000);assert.equal(s.platform,300000);assert.equal(s.advanced,140000);
 b=loanAction(b,'loan_pay','later',payment('borrower','mandiri',[{number:1,amount:40000}]),'alice',now);
 assert.equal(installments(b.loans[0])[0].borrowerRemaining,0);assert.equal(installments(b.loans[0])[0].platformRemaining,0);
 b=loanAction(b,'loan_cancel_payment','paid',{loanId:'loan'},'alice',now);
 assert.equal(accountBalance(b,'mandiri').current,309175);assert.equal(loanSummary(b.loans[0]).platform,500000);assert.equal(loanSummary(b.loans[0]).borrower,400000);
 assert.equal(b.entries.find(e=>e.id==='paid').cancelled,true);assert.equal(b.loans[0].payments.find(p=>p.id==='paid').cancelled,true);
});
test('reject insufficient funds, overpayments, duplicate allocations, invalid dates and unknown wallets without mutation',()=>{
 const b=base(),snapshot=structuredClone(b);
 for(const input of [payment('platform','mandiri',[{number:1,amount:100000},{number:2,amount:100000},{number:3,amount:100000}]),payment('borrower','shopee',[{number:1,amount:100001}]),payment('borrower','shopee',[{number:1,amount:1},{number:1,amount:1}]),payment('borrower','missing',[{number:1,amount:1}]),payment('borrower','shopee',[{number:0,amount:1}]),payment('borrower','shopee',[{number:1,amount:1}],{date:'2099-01-01'})])assert.throws(()=>loanAction(b,'loan_pay','p',input,'alice',now));
 assert.deepEqual(b,snapshot);
 const paid=loanAction(b,'loan_pay','p',payment('borrower','shopee',[{number:1,amount:100000}]),'alice',now);
 assert.throws(()=>loanAction(paid,'loan_pay','p2',payment('borrower','shopee',[{number:1,amount:1}]),'alice',now));
 assert.throws(()=>walletAction(paid,'move_account','p',{accountId:'mandiri'},'alice',now));
});
test('historical payments update schedules only and month-end dates recover original day',()=>{
 let b=base();b=loanAction(b,'loan_pay','historic',payment('platform','mandiri',[{number:1,amount:100000}],{historical:true}),'alice',now);
 assert.equal(b.entries.length,0);assert.equal(accountBalance(b,'mandiri').current,269175);assert.equal(loanSummary(b.loans[0]).platform,400000);
 b=loanAction(b,'loan_cancel_payment','historic',{loanId:'loan'},'alice',now);assert.equal(loanSummary(b.loans[0]).platform,500000);
 assert.equal(dueDate('2024-01-31',1),'2024-02-29');assert.equal(dueDate('2024-01-31',2),'2024-03-31');assert.equal(dueDate('2024-02-29',1,31),'2024-03-31');
 const x=loanAction({revision:0,entries:[]},'loan_create','x',{...fields,date:'2024-01-31',firstDue:'2024-02-29',dueDay:31},'alice',now);assert.equal(installments(x.loans[0])[1].due,'2024-03-31');
});
test('API payments are atomic, retry-safe, revision-protected, isolated and locked against finance edits',async()=>{
 const f=fixture(),a=await f.call('/auth/register',{username:'alice',password:'alice-password-123'}),b=await f.call('/auth/register',{username:'bobby',password:'bobby-password-123'});let revision=0;
 async function post(action,id,fields){const req={action,id,fields,expectedRevision:revision,operationId:randomUUID()},r=await f.call('/finance',req,a.sessionToken);if(r.status===200)revision=r.data.revision;return {r,req};}
 const loan=randomUUID(),pay=randomUUID();assert.equal((await post('opening',randomUUID(),{amount:150000,date:'2026-10-01'})).r.status,200);
 assert.equal((await post('loan_create',loan,fields)).r.status,200);
 const result=await post('loan_pay',pay,{...payment('platform','mandiri',[{number:1,amount:100000}]),loanId:loan});assert.equal(result.r.status,200);assert.equal(accountBalance(result.r.data,'mandiri').current,50000);
 assert.deepEqual((await f.call('/finance',result.req,a.sessionToken)).data,result.r.data);
 assert.equal((await f.call('/finance',{...result.req,operationId:randomUUID()},a.sessionToken)).status,409);
 assert.equal((await f.call('/finance',undefined,b.sessionToken)).data.loans,undefined);
 assert.equal((await post('cancel',pay)).r.status,400);
 assert.equal((await post('loan_pay',randomUUID(),{...payment('platform','mandiri',[{number:2,amount:100000}]),loanId:loan})).r.status,400);
 assert.equal((await f.call('/finance',undefined,a.sessionToken)).data.revision,3);
 assert.equal((await post('loan_cancel_payment',pay,{loanId:loan})).r.status,200);
 assert.equal(accountBalance((await f.call('/finance',undefined,a.sessionToken)).data,'mandiri').current,150000);
});
