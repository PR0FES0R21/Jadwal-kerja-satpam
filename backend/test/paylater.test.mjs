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
