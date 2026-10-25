import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyData,interval,ledger,validateBackup,validateEvent,eventsStartingOn,workIntervals,clippedHours} from '../../lib/jaga.ts';

const duty=(id,date,direction='give',settlement)=>({id,type:'swap',personId:'peer',direction,...(settlement?{settlement}:{}),date,shift:'day',...interval(date,'day'),status:'realized',reason:'',notes:'',created:'2026-01-01T00:00:00Z',revision:1});
const dataFor=events=>({...emptyData(),anchor:'2026-01-12',people:[{id:'peer',name:'Rekan',team:'A',archived:false}],events});

test('paid duty in either direction creates no debt or repayment link',()=>{
 for(const direction of ['give','receive']){
  const e=duty('paid','2026-01-17',direction,'paid'),book=ledger([e]);
  assert.equal(book.balances.peer??0,0);
  assert.deepEqual(book.info.paid,{status:'paid'});
 }
});

test('paid duties never consume FIFO debt; legacy and explicit swaps retain FIFO in both directions',()=>{
 for(const direction of ['give','receive']){
  const reverse=direction==='give'?'receive':'give';
  const a=duty('first','2026-01-01',direction),b=duty('second','2026-01-02',direction,'swap'),cash=duty('cash','2026-01-03',reverse,'paid'),repay=duty('repay','2026-01-04',reverse,'swap');
  const before=ledger([b,cash,a]);assert.equal(before.balances.peer,direction==='give'?2:-2);assert.equal(before.info.first.linked,undefined);
  const book=ledger([repay,b,cash,a]);assert.equal(book.balances.peer,direction==='give'?1:-1);assert.equal(book.info.first.linked,'repay');assert.equal(book.info.repay.linked,'first');assert.equal(book.info.second.linked,undefined);assert.equal(book.info.cash.linked,undefined);
 }
});

test('editing settlement recomputes old repayment links; cancellation and plans do not affect debt',()=>{
 const a=duty('first','2026-01-01'),b=duty('second','2026-01-02'),repay=duty('repay','2026-01-03','receive');
 assert.equal(ledger([a,b,repay]).info.first.linked,'repay');
 const edited=ledger([{...a,settlement:'paid'},b,repay]);assert.equal(edited.info.second.linked,'repay');assert.equal(edited.info.first.linked,undefined);assert.equal(edited.balances.peer,0);
 assert.equal(ledger([a,b,{...repay,settlement:'paid'}]).balances.peer,2);
 for(const status of ['planned','cancelled']){
  const book=ledger([a,{...b,settlement:'paid',status}]);assert.equal(book.balances.peer,1);assert.equal(book.info.second,undefined);
 }
 assert.equal(ledger([a,b,repay]).balances.peer,1);
});

test('paid duties remain in calendar start-date markers and work-hour calculations',()=>{
 const give={...duty('give','2026-01-17','give','paid'),shift:'night',...interval('2026-01-17','night')};
 assert.equal(eventsStartingOn([give],'2026-01-17').length,1);assert.equal(eventsStartingOn([give],'2026-01-18').length,0);
 assert.equal(clippedHours(workIntervals(dataFor([give]),'2026-01-17','2026-01-17',true),'2026-01-17','2026-01-17'),4);
 const receive=duty('receive','2026-01-18','receive','paid');
 assert.equal(workIntervals(dataFor([receive]),'2026-01-18','2026-01-18').length,0);
 assert.equal(workIntervals(dataFor([{...receive,status:'cancelled'}]),'2026-01-18','2026-01-18').length,1);
});

test('paid choice survives backup roundtrip and old backups need no migration',()=>{
 for(const settlement of [undefined,'swap','paid']){
  const data=dataFor([duty('give','2026-01-17','give',settlement),duty('receive','2026-01-18','receive',settlement)]);
  const restored=validateBackup(JSON.parse(JSON.stringify(data)));assert.deepEqual(restored,data);assert.equal(restored.events[0].settlement,settlement);
 }
 for(const settlement of ['cash',false,null,{},0]){
  assert.throws(()=>validateBackup(dataFor([{...duty('bad','2026-01-17'),settlement,status:'cancelled'}])),/penyelesaian/);
 }
 assert.throws(()=>validateEvent({...duty('bad','2026-01-17','give','paid'),type:'overtime'},dataFor([])),/penyelesaian/);
});

test('paid choice still enforces full shifts, person validation and schedule overlap',()=>{
 assert.throws(()=>validateEvent(duty('bad','2026-01-18','give','paid'),dataFor([])),/bertabrakan/);
 assert.throws(()=>validateEvent({...duty('bad','2026-01-17','give','paid'),personId:'missing'},dataFor([])),/rekan/);
 assert.throws(()=>validateEvent({...duty('bad','2026-01-17','give','paid'),end:'2026-01-17T19:00:00+07:00'},dataFor([])),/shift penuh/);
});
