import test from 'node:test';
import assert from 'node:assert/strict';
import {runningBalance,syncDutyFinance} from '../../lib/finance.ts';
import {emptyData,interval,validateEvent} from '../../lib/jaga.ts';
const entry=(id,date,amount,type='expense')=>({id,date,amount,type,createdAt:'2026-10-26T00:00:00Z',cancelled:false});
const opening={amount:269175,date:'2026-10-26',excludedEntryIds:['old']};
test('running balance uses complete chronological ledger, stable ordering and excludes pre-opening history',()=>{
 const book={revision:1,opening,entries:[entry('z','2026-10-27',20000),entry('old','2026-10-26',1000000,'income'),entry('pre','2026-10-25',50000),entry('b','2026-10-26',10000),entry('a','2026-10-26',100000,'income'),{...entry('cancelled','2026-10-27',900000),cancelled:true}]};
 assert.deepEqual(runningBalance(book),{current:339175,balances:{a:369175,b:359175,z:339175}});
 // A late entry for an earlier activity date recalculates each following balance.
 book.entries.push(entry('late','2026-10-26',5000));
 assert.deepEqual(runningBalance(book),{current:334175,balances:{a:369175,b:359175,late:354175,z:334175}});
 book.entries.find(e=>e.id==='a').cancelled=true;
 assert.equal(runningBalance(book).current,234175);
 assert.equal(runningBalance({revision:0,entries:[]}).current,null);
 assert.equal(runningBalance({revision:0,entries:[],opening}).current,269175);
});
test('payment synchronization is a no-op for unrelated changes and retains audit on restore',()=>{
 const state={...emptyData(),people:[{id:'p',name:'Budi'}],events:[{id:'e',type:'swap',settlement:'paid',direction:'give',status:'planned',personId:'p',date:'2026-10-27',payment:{date:'2026-10-26',amount:100000}}]};
 let book=syncDutyFinance({revision:0,entries:[],opening},state,'alice','2026-10-26T01:00:00Z');
 assert.equal(book.entries.length,1);assert.equal(runningBalance(book).current,369175);
 assert.equal(syncDutyFinance(book,state,'alice','2026-10-26T02:00:00Z'),book);
 state.events[0].status='cancelled';book=syncDutyFinance(book,state,'alice','2026-10-26T03:00:00Z');
 assert.equal(runningBalance(book).current,269175);
 state.events[0].status='planned';book=syncDutyFinance(book,state,'alice','2026-10-26T04:00:00Z');
 assert.equal(book.entries.length,1);assert.equal(book.entries[0].history.length,3);assert.equal(book.entries[0].createdAt,'2026-10-26T01:00:00Z');
 state.events[0].direction='receive';book=syncDutyFinance(book,state,'alice','2026-10-26T05:00:00Z');
 assert.equal(runningBalance(book).current,169175);
});
test('replacement validation accepts empty and cancelled dates and identifies the real conflict',()=>{
 const e={id:'new',type:'swap',personId:'p',direction:'receive',date:'2026-01-12',shift:'day',...interval('2026-01-12','day'),status:'realized',reason:'',notes:'',created:'2026-01-12T15:00:00Z',revision:1};
 const state={...emptyData(),anchor:'2026-01-12',people:[{id:'p',name:'Budi',team:'A',archived:false}],events:[]};
 assert.doesNotThrow(()=>validateEvent(e,state));
 assert.doesNotThrow(()=>validateEvent(e,{...state,events:[e]}));
 assert.doesNotThrow(()=>validateEvent(e,{...state,events:[{...e,id:'old',status:'cancelled'}]}));
 assert.throws(()=>validateEvent(e,{...state,events:[{...e,id:'old',status:'planned'}]}),/2026-01-12.*Budi.*rencana/);
});
