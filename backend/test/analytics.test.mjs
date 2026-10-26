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
test('empty months remain visible, custom boundaries are inclusive and no data invents no growth',()=>{
 const f={...filter,from:'2026-08-31',to:'2026-10-01'},r=financeAnalytics({revision:0,entries:[row('first','income',10,'Gaji',f.from),row('last','expense',2,'Makan',f.to)]},f,'custom',now);
 assert.equal(r.months.length,3);assert.equal(r.months[1].income,0);assert.equal(r.entries.length,2);assert.equal(r.previousCount,0);
 const empty=financeAnalytics({revision:0,entries:[]},filter,'month',now);assert.equal(empty.expense,0);assert.equal(empty.dailyExpense,0);assert.deepEqual(empty.spending,[]);
});
