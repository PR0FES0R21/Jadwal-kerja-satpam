import test from 'node:test';
import assert from 'node:assert/strict';
import {financeAnalytics,presetRange,previousRange,validateRange} from '../../lib/analytics.ts';
const now='2026-10-26',filter={...presetRange('month',now),account:'all',category:'all'};
const row=(id,type,amount,category,date=now,extra={})=>({id,type,amount,category,date,createdAt:now+'T12:00:00Z',cancelled:false,...extra});
test('analytics excludes opening, cancelled entries and transfer principal but includes fees; salary and repayments stay distinct',()=>{
 const book={revision:0,opening:{amount:999999},entries:[row('salary','income',1000000,'Gaji'),row('repay','income',500000,'Pembayaran utang'),row('food','expense',100000,'Makan'),row('fee','expense',2500,'Lainnya',now,{transferFeeFor:'t'}),row('out','expense',90000,'Lainnya',now,{transferId:'t'}),row('in','income',90000,'Lainnya',now,{transferId:'t',accountId:'bca'}),row('cancel','expense',300000,'Kos',now,{cancelled:true}),row('old','expense',150000,'Makan','2026-09-26'),row('outside','income',1,'Gaji','2026-10-27')]};
 const r=financeAnalytics(book,filter,'month',now);assert.equal(r.income,1500000);assert.equal(r.expense,102500);assert.equal(r.net,1397500);assert.equal(r.salary,1000000);assert.equal(r.sources.length,2);assert.equal(r.previousExpense,150000);assert.equal(r.dailyExpense,102500/26);assert.equal(r.entries.length,4);
 assert.equal(r.spending.reduce((n,g)=>n+g.total,0),r.expense);assert.equal(r.months[0].income,r.income);
 assert.equal(financeAnalytics(book,{...filter,account:'mandiri',category:'Makan'},'month',now).expense,100000);
 assert.equal(financeAnalytics(book,{...filter,account:'bca'},'month',now).income,0);
});
test('periods use deterministic calendar dates, clamp leap month, and compare elapsed days',()=>{
 assert.deepEqual(presetRange('quarter','2026-01-10'),{from:'2025-11-01',to:'2026-01-10'});
 assert.deepEqual(presetRange('lastMonth','2024-03-10'),{from:'2024-02-01',to:'2024-02-29'});
 assert.deepEqual(previousRange(filter,'month'),{from:'2026-09-01',to:'2026-09-26'});
 assert.deepEqual(previousRange({...filter,from:'2024-03-01',to:'2024-03-31'},'month'),{from:'2024-02-01',to:'2024-02-29'});
 assert.deepEqual(previousRange({...filter,from:'2026-10-10',to:'2026-10-12'},'custom'),{from:'2026-10-07',to:'2026-10-09'});
 for(const patch of [{from:'2026-10-28'},{to:'2026-10-27'},{from:'2026-02-30'},{from:'2020-01-01'}])assert.throws(()=>validateRange({...filter,...patch},now));
});
test('weekly, rolling-day, and multi-month presets use inclusive calendar dates',()=>{
 const current='2024-03-06';
 assert.deepEqual(presetRange('week',current),{from:'2024-03-04',to:current});
 assert.deepEqual(presetRange('last7',current),{from:'2024-02-29',to:current});
 assert.deepEqual(presetRange('last30',current),{from:'2024-02-06',to:current});
 const last90=presetRange('last90',current);
 assert.equal((+new Date(last90.to+'T00:00:00Z')-+new Date(last90.from+'T00:00:00Z'))/86400000+1,90);
 assert.deepEqual(presetRange('quarter',current),{from:'2024-01-01',to:current});
 assert.deepEqual(presetRange('sixMonths',current),{from:'2023-10-01',to:current});
});
test('daily spending counts PayLater on its purchase date and separates repayments from the stacked total',()=>{
 const from='2026-10-26',to='2026-10-28',f={from,to,account:'all',category:'all'};
 const book={revision:0,entries:[
  row('cash-a','expense',100,'Makan',from),
  row('repayment','expense',40,'Cicilan','2026-10-27',{sourcePayLaterPaymentId:'paylater-payment'}),
  row('cash-b','expense',50,'Belanja','2026-10-27'),
  row('transfer','expense',900,'Lainnya','2026-10-27',{transferId:'transfer'}),
  row('cancelled','expense',700,'Kos','2026-10-27',{cancelled:true}),
 ],payLaterPurchases:[
  {id:'purchase-a',date:from,principal:300,category:'Belanja',cancelled:false},
  {id:'purchase-b',date:'2026-10-27',principal:500,category:'Belanja',cancelled:false},
  {id:'cancelled-purchase',date:'2026-10-27',principal:800,category:'Belanja',cancelled:true},
 ]};
 const report=financeAnalytics(book,f,'custom',to);
 assert.deepEqual(report.daily,[
  {date:from,cash:100,credit:300,repayment:0,total:400},
  {date:'2026-10-27',cash:50,credit:500,repayment:40,total:550},
  {date:to,cash:0,credit:0,repayment:0,total:0},
 ]);
 assert.equal(report.dailyTotal,950);
 assert.equal(report.creditTotal,800);
 assert.equal(report.expense,190);
});
test('empty months remain visible, custom boundaries are inclusive and no data invents no growth',()=>{
 const f={...filter,from:'2026-08-31',to:'2026-10-01'},r=financeAnalytics({revision:0,entries:[row('first','income',10,'Gaji',f.from),row('last','expense',2,'Makan',f.to)]},f,'custom',now);
 assert.equal(r.months.length,3);assert.equal(r.months[1].income,0);assert.equal(r.entries.length,2);assert.equal(r.previousCount,0);
 const empty=financeAnalytics({revision:0,entries:[]},filter,'month',now);assert.equal(empty.expense,0);assert.equal(empty.dailyExpense,0);assert.deepEqual(empty.spending,[]);
});

test('finance report API returns daily buckets for the chart',async()=>{
 const {fixture}=await import('./fixture.mjs');
 const f=fixture(),user=await f.call('/auth/register',{username:'dailyreportuser',password:'valid-password-123'});
 const record=await f.database.collection('users').findOne({username:'dailyreportuser'}),date='2026-10-26';
 await f.database.collection('finance').insertOne({_id:record._id,data:{revision:1,entries:[row('cash-entry','expense',10,'Makan',date)],payLaterPurchases:[{id:'credit-purchase',date,principal:20,category:'Belanja',cancelled:false}]}});
 const response=await f.call('/finance/report?from='+date+'&to='+date,undefined,user.sessionToken);
 assert.equal(response.status,200);
 assert.deepEqual(response.report.daily,[{date,cash:10,credit:20,repayment:0,total:30}]);
 assert.equal(response.report.dailyTotal,30);
});
