import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {payLaterAction as act,payLaterBalance as balance,payLaterRows as rows} from '../../lib/paylater.ts';import {accountBalance,financeFields,walletAction} from '../../lib/finance.ts';import {financeAnalytics} from '../../lib/analytics.ts';import {fixture} from './fixture.mjs';
const now='2026-10-30T00:00:00Z',purchase={facilityId:'facility',description:'Sepatu',category:'Belanja',party:'',date:'2026-10-30',principal:600000,monthly:220000,tenor:3,firstDue:'2026-11-30'};
function base(restore='installment'){return act({revision:0,entries:[],opening:{amount:1000000,date:'2026-10-01',excludedEntryIds:[]}},'pl_account','facility',{name:'Contoh',limit:2000000,restore},'qa',now);}
const pay=(numbers)=>({purchaseId:'purchase',numbers,date:'2026-10-30',accountId:'mandiri'});
test('limit is separate from cash; only principal restores and cash payment is counted once',()=>{
 let b=act(base(),'pl_purchase','purchase',purchase,'qa',now);assert.equal(balance(b,'facility').available,1400000);assert.equal(accountBalance(b,'mandiri').current,1000000);assert.equal(b.entries.length,0);
 b=act(b,'pl_pay','paid',pay([1]),'qa',now);assert.equal(balance(b,'facility').available,1600000);assert.equal(accountBalance(b,'mandiri').current,780000);assert.equal(rows(b,b.payLaterPurchases[0])[0].paid,true);
 assert.throws(()=>act(b,'pl_pay','again',pay([1]),'qa',now));assert.throws(()=>walletAction(b,'move_account','paid',{accountId:'mandiri'},'qa',now));
 const report=financeAnalytics(b,{from:'2026-10-01',to:'2026-10-30',account:'all',category:'all'},'month','2026-10-30');assert.equal(report.expense,220000);assert.equal(report.creditTotal,600000);
 b=act(b,'pl_cancel_payment','paid',{},'qa',now);assert.equal(balance(b,'facility').available,1400000);assert.equal(accountBalance(b,'mandiri').current,1000000);
 b=act(b,'pl_cancel_purchase','purchase',{},'qa',now);assert.equal(balance(b,'facility').available,2000000);
});
test('full-settlement limit, rounding, edit validation and rollback after reuse',()=>{
 let b=act(base('full'),'pl_purchase','purchase',{...purchase,principal:600001},'qa',now);assert.equal(rows(b,b.payLaterPurchases[0]).reduce((n,r)=>n+r.principal,0),600001);
 b=act(b,'pl_pay','p1',pay([1,2]),'qa',now);assert.equal(balance(b,'facility').available,1399999);assert.throws(()=>act(b,'pl_edit_purchase','purchase',purchase,'qa',now));assert.throws(()=>act(b,'pl_cancel_purchase','purchase',{},'qa',now));
 b=act(b,'pl_pay','p2',pay([3]),'qa',now);assert.equal(balance(b,'facility').available,2000000);
 b=act(b,'pl_purchase','reuse',{...purchase,principal:1800000,monthly:600000},'qa',now);b=act(b,'pl_cancel_payment','p2',{},'qa',now);assert.equal(balance(b,'facility').available,-400001);assert.throws(()=>act(b,'pl_purchase','blocked',purchase,'qa',now));
});
test('invalid limits, payment amounts, dates and duplicates do not mutate state',()=>{
 const b=act(base(),'pl_purchase','purchase',purchase,'qa',now),copy=structuredClone(b);
 for(const v of [{...pay([1]),numbers:[1,1]},{...pay([1]),numbers:[9]},{...pay([1]),accountId:'missing'},{...pay([1]),date:'2099-01-01'}])assert.throws(()=>act(b,'pl_pay','bad',v,'qa',now));
 assert.throws(()=>act({...b,opening:{...b.opening,amount:1}},'pl_pay','bad',pay([1]),'qa',now));assert.throws(()=>act(b,'pl_purchase','bad',{...purchase,principal:2000001,monthly:700000},'qa',now));assert.throws(()=>act(b,'pl_edit_account','facility',{name:'X',limit:1,restore:'installment'},'qa',now));assert.deepEqual(b,copy);
 const c=act(b,'pl_edit_purchase','purchase',{...purchase,principal:300000,monthly:110000},'qa',now);assert.equal(balance(c,'facility').available,1700000);
});
test('API guards sensitive changes, retries, revision conflicts and account isolation',async()=>{
 const f=fixture(),a=await f.call('/auth/register',{username:'credituser',password:'credit-password-123'}),other=await f.call('/auth/register',{username:'creditother',password:'credit-password-123'});let revision=0;
 async function post(action,id,fields,password){const req={action,id,fields,password,expectedRevision:revision,operationId:randomUUID()},r=await f.call('/finance',req,a.sessionToken);if(r.status===200)revision=r.data.revision;return {r,req};}
 const aid=randomUUID(),pid=randomUUID(),payid=randomUUID();assert.equal((await post('pl_account',aid,{name:'Contoh',limit:2000000,restore:'installment'})).r.status,200);await post('opening',randomUUID(),{amount:1000000,date:'2026-10-01'});assert.equal((await post('pl_purchase',pid,{...purchase,facilityId:aid})).r.status,200);
 const r=await post('pl_pay',payid,{...pay([1]),purchaseId:pid});assert.equal(r.r.status,200);assert.deepEqual((await f.call('/finance',r.req,a.sessionToken)).data,r.r.data);assert.equal((await f.call('/finance',{...r.req,operationId:randomUUID()},a.sessionToken)).status,409);
 assert.equal((await post('cancel',payid)).r.status,400);assert.equal((await post('pl_cancel_payment',payid,{})).r.status,400);assert.equal((await post('pl_cancel_payment',payid,{},'wrong')).r.status,403);assert.equal((await post('pl_cancel_payment',payid,{},'credit-password-123')).r.status,200);
 assert.equal((await f.call('/finance',undefined,other.sessionToken)).data.payLaterAccounts,undefined);
});
test('transaction icons are typed metadata with category validation and legacy compatibility',()=>{
 const f={type:'expense',date:'2026-10-30',amount:5000,category:'Transportasi',description:'Ke stasiun',party:'',method:'',transactionKind:'Kereta'};assert.equal(financeFields(f).transactionKind,'Kereta');assert.throws(()=>financeFields({...f,transactionKind:'Kopi'}));assert.equal(financeFields({...f,transactionKind:undefined}).transactionKind,'');
});

test('current available limit imports only unrecorded principal, including zero and existing accounts',()=>{
 let b=act(base(),'pl_edit_account','facility',{name:'Contoh',limit:2000000,available:800000,restore:'installment'},'qa',now);
 assert.equal(balance(b,'facility').openingUsed,1200000);assert.equal(balance(b,'facility').available,800000);assert.equal(b.entries.length,0);
 b=act(b,'pl_purchase','purchase',purchase,'qa',now);assert.equal(balance(b,'facility').available,200000);
 b=act(b,'pl_edit_account','facility',{name:'Contoh',limit:2000000,available:100000,restore:'installment'},'qa',now);
 assert.equal(balance(b,'facility').openingUsed,1300000);assert.equal(balance(b,'facility').trackedUsed,600000);
 assert.equal(b.payLaterPurchases.length,1);assert.equal(accountBalance(b,'mandiri').current,1000000);
 assert.throws(()=>act(b,'pl_edit_account','facility',{name:'Contoh',limit:2000000,available:1500000,restore:'installment'},'qa',now),/transaksi aktif/);
 const empty={revision:0,entries:[]};for(const available of [-1,2000001,0.5,'0',null])assert.throws(()=>act(empty,'pl_account','new',{name:'Contoh',limit:2000000,available,restore:'full'},'qa',now));
 b=act(empty,'pl_account','new',{name:'Contoh',limit:2000000,available:0,restore:'full'},'qa',now);assert.equal(balance(b,'new').available,0);assert.equal(balance(b,'new').used,2000000);
 assert.throws(()=>act(b,'pl_purchase','purchase',{...purchase,facilityId:'new'},'qa',now),/Limit tersedia/);
});

test('opening repayments restore principal only, audit cash once, and cancel safely after reconciliation and reuse',()=>{
 let b=act(base(),'pl_edit_account','facility',{name:'Contoh',limit:2000000,available:800000,restore:'installment'},'qa',now);
 const fields={facilityId:'facility',principal:200000,fee:10000,accountId:'mandiri',date:'2026-10-30'};
 b=act(b,'pl_pay_opening','opening-payment',fields,'qa',now);
 assert.equal(balance(b,'facility').available,1000000);assert.equal(balance(b,'facility').openingUsed,1000000);assert.equal(accountBalance(b,'mandiri').current,790000);
 const report=financeAnalytics(b,{from:'2026-10-01',to:'2026-10-30',account:'all',category:'all'},'month','2026-10-30');assert.equal(report.expense,210000);assert.equal(report.creditTotal,0);
 assert.throws(()=>act(b,'pl_pay_opening','duplicate',{...fields,principal:1000001},'qa',now));assert.throws(()=>act(b,'pl_pay_opening','bad',{...fields,fee:-1},'qa',now));assert.throws(()=>act(b,'pl_pay_opening','bad',{...fields,accountId:'facility'},'qa',now));
 b=act(b,'pl_edit_account','facility',{name:'Contoh',limit:2000000,available:1000000,restore:'installment'},'qa',now);
 assert.equal(b.payLaterAccounts[0].openingUsed,1200000);assert.equal(b.payLaterAccounts[0].history.at(-1).before.openingUsed,1200000);
 b=act(b,'pl_purchase','reuse',{...purchase,principal:1000000,monthly:350000},'qa',now);
 b=act(b,'pl_cancel_payment','opening-payment',{},'qa',now);
 assert.equal(balance(b,'facility').available,-200000);assert.equal(accountBalance(b,'mandiri').current,1000000);assert.equal(b.entries.filter(e=>!e.cancelled).length,0);
 assert.throws(()=>act(b,'pl_purchase','blocked',purchase,'qa',now),/Limit tersedia/);
});

test('credit transaction history stays linked across edits and cancellation, separate from cash and analytics',async()=>{
 const {payLaterTransactions}=await import('../../lib/paylater.ts');
 let b=act(base(),'pl_purchase','purchase',{...purchase,category:'Transportasi',transactionKind:'Kereta'},'qa',now);
 let list=payLaterTransactions(b);assert.equal(list.length,1);assert.equal(list[0].sourcePayLaterPurchaseId,'purchase');assert.equal(list[0].accountId,'paylater:facility');assert.equal(list[0].transactionKind,'Kereta');assert.equal(b.entries.length,0);
 b=act(b,'pl_edit_purchase','purchase',{...purchase,category:'Transportasi',transactionKind:'Pesawat',principal:300000,monthly:100000},'qa',now);
 list=payLaterTransactions(b);assert.equal(list.length,1);assert.equal(list[0].amount,300000);assert.equal(list[0].history.length,2);assert.equal(list[0].history[1].before.amount,600000);
 b=act(b,'pl_cancel_purchase','purchase',{},'qa',now);assert.equal(payLaterTransactions(b)[0].cancelled,true);assert.equal(balance(b,'facility').available,2000000);
 assert.throws(()=>act(base(),'pl_purchase','bad',{...purchase,transactionKind:'Kereta'},'qa',now),/kategori/);
});

test('opening import and payment API preserve idempotency, password guards, ownership and revision conflicts',async()=>{
 const f=fixture(),a=await f.call('/auth/register',{username:'openinguser',password:'credit-password-123'});let revision=0;
 async function post(action,id,fields,password){const req={action,id,fields,password,expectedRevision:revision,operationId:randomUUID()},r=await f.call('/finance',req,a.sessionToken);if(r.status===200)revision=r.data.revision;return {r,req};}
 const aid=randomUUID();let r=await post('pl_account',aid,{name:'Contoh',limit:2000000,available:800000,restore:'installment'});assert.equal(r.r.status,200);assert.equal(balance(r.r.data,aid).available,800000);
 await post('opening',randomUUID(),{amount:1000000,date:'2026-10-01'});
 r=await post('pl_pay_opening',randomUUID(),{facilityId:aid,principal:100000,fee:5000,date:'2026-10-30',accountId:'mandiri'});assert.equal(r.r.status,200);assert.equal(balance(r.r.data,aid).available,900000);
 assert.deepEqual((await f.call('/finance',r.req,a.sessionToken)).data,r.r.data);assert.equal((await f.call('/finance',{...r.req,operationId:randomUUID()},a.sessionToken)).status,409);
 assert.equal((await post('pl_edit_account',aid,{name:'Contoh',limit:2000000,available:1000000,restore:'installment'})).r.status,400);
 assert.equal((await post('cancel',r.req.id)).r.status,400);
 assert.equal((await post('pl_cancel_payment',r.req.id,{},'credit-password-123')).r.status,200);
 assert.equal(balance((await f.call('/finance',undefined,a.sessionToken)).data,aid).available,800000);
});
