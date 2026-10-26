import test from 'node:test';
import assert from 'node:assert/strict';
import {browserRequest} from '../browser.mjs';
import {emptyData} from '../../lib/jaga.ts';
import {runningBalance} from '../../lib/finance.ts';
import {emptyProfile} from '../../lib/profile.ts';
import {digest,token,hashPassword} from '../security.mjs';
import {fixture} from './fixture.mjs';
test('public signup, case-insensitive unique usernames, persistent login and logout',async()=>{
 const f=fixture();assert.deepEqual(await f.call('/auth/me'),{status:200,user:null});
 const a=await f.call('/auth/register',{username:'Alice',password:'alice-password-123'});assert.equal(a.status,200);assert.match(a.recoveryCode,/^[A-Za-z0-9_-]{43}$/);
 assert.equal((await f.call('/auth/register',{username:'ALICE',password:'other-password-123'})).status,409);
 assert.equal((await f.call('/auth/login',{username:'ALICE',password:'alice-password-123'})).status,200);
 assert.equal((await f.call('/auth/me',undefined,a.sessionToken)).user.username,'alice');
 assert.equal((await f.call('/auth/login',{username:'alice',password:'incorrect'})).status,401);
 await f.call('/auth/logout',{},a.sessionToken);assert.equal((await f.call('/state',undefined,a.sessionToken)).status,401);
});
test('accounts isolate state, operations, version lists and restoring another account revision',async()=>{
 const f=fixture(),a=await f.call('/auth/register',{username:'alice',password:'alice-password-123'}),b=await f.call('/auth/register',{username:'bobby',password:'bobby-password-123'});
 const first={...emptyData(),revision:1,people:[{id:'peer-a',name:'Alice peer',team:'',archived:false}]};
 assert.equal((await f.save(first,a.sessionToken)).status,200);
 assert.equal((await f.save(first,a.sessionToken)).status,200);
 assert.equal((await f.save({...first,people:[]},a.sessionToken)).status,409);
 assert.deepEqual((await f.call('/state',undefined,b.sessionToken)).data.people,[]);
 assert.deepEqual((await f.call('/versions',undefined,b.sessionToken)).versions,[]);
 assert.equal((await f.call('/versions/restore',{revision:0,expectedRevision:0},b.sessionToken)).status,404);
 const second={...emptyData(),revision:1,people:[{id:'peer-b',name:'Bob peer',team:'',archived:false}]};
 assert.equal((await f.save(second,b.sessionToken)).status,200); // identical operation id in a different account
 assert.equal((await f.call('/state',undefined,a.sessionToken)).data.people[0].id,'peer-a');
 assert.equal((await f.save(first,a.sessionToken,0,digest('stale'))).status,409);
 const restored=await f.call('/versions/restore',{revision:0,expectedRevision:1},b.sessionToken);assert.equal(restored.status,200);assert.equal(restored.data.revision,2);assert.deepEqual((await f.call('/versions/restore',{revision:0,expectedRevision:1},b.sessionToken)).data,restored.data);
 assert.equal((await f.call('/state',undefined,a.sessionToken)).data.revision,1);
});
test('recovery requires a private single-use code, retains data and revokes sessions',async()=>{
 const f=fixture(),a=await f.call('/auth/register',{username:'alice',password:'alice-password-123'});
 const data={...emptyData(),revision:1,people:[{id:'keep',name:'Preserved',team:'',archived:false}]};assert.equal((await f.save(data,a.sessionToken)).status,200);
 assert.equal((await f.call('/auth/recover',{username:'alice',password:'replacement-1234',recoveryCode:token()})).status,401);
 const r=await f.call('/auth/recover',{username:'alice',password:'replacement-1234',recoveryCode:a.recoveryCode});assert.equal(r.status,200);
 assert.equal((await f.call('/state',undefined,a.sessionToken)).status,401);
 assert.deepEqual((await f.call('/state',undefined,r.sessionToken)).data,data);
 assert.equal((await f.call('/auth/recover',{username:'alice',password:'replacement-5678',recoveryCode:a.recoveryCode})).status,401);
 assert.equal((await f.call('/auth/login',{username:'alice',password:'alice-password-123'})).status,401);
 assert.equal((await f.call('/auth/login',{username:'alice',password:'replacement-1234'})).status,200);
});
test('existing owner account keeps its id, data and versions and can prepare recovery',async()=>{
 const f=fixture();await f.database.collection('users').insertOne({_id:'owner',username:'sayoga',passwordHash:await hashPassword('existing-password-123')});
 const data={...emptyData(),revision:3};await f.database.collection('states').insertOne({_id:'owner',data});await f.database.collection('versions').insertOne({userId:'owner',revision:2,data:emptyData(),savedAt:new Date()});
 const a=await f.call('/auth/login',{username:'sayoga',password:'existing-password-123'});assert.equal(a.status,200);assert.deepEqual((await f.call('/state',undefined,a.sessionToken)).data,data);assert.equal((await f.call('/versions',undefined,a.sessionToken)).versions.length,1);
 assert.equal((await f.call('/auth/recovery-key',{password:'wrong-password'},a.sessionToken)).status,401);
 assert.match((await f.call('/auth/recovery-key',{password:'existing-password-123'},a.sessionToken)).recoveryCode,/^[A-Za-z0-9_-]{43}$/);
 assert.equal((await f.call('/auth/setup',{})).status,401);
});
test('browser adapter uses HttpOnly cookies, rejects cross-origin writes and ignores spoofed headers',async()=>{
 const f=fixture();const req=(path,body,headers={})=>new Request('https://test.invalid/api/cloud/'+path,{method:body?'POST':'GET',headers:{origin:'https://test.invalid',...headers},...(body?{body:JSON.stringify(body)}:{})});
 const result=await browserRequest(req('auth/register',{username:'alice',password:'alice-password-123'}),f.handle,'test-key','ip');assert.equal(result.status,200);
 const payload=await result.json();assert.equal(payload.sessionToken,undefined);assert.ok(payload.recoveryCode);const cookie=result.headers.get('set-cookie');assert.match(cookie,/HttpOnly; Secure; SameSite=Lax/);
 assert.equal((await browserRequest(req('state',undefined,{cookie}),f.handle,'test-key','ip')).status,200);
 assert.equal((await browserRequest(req('state',undefined,{'x-jaga-session':cookie.split('=')[1].split(';')[0]}),f.handle,'test-key','ip')).status,401);
 assert.equal((await browserRequest(req('auth/register',{username:'bobby',password:'bobby-password-123'},{origin:'https://attacker.invalid'}),f.handle,'test-key','ip')).status,403);
});

test('profiles are session scoped, validated, revision protected and separate from calendar data',async()=>{
 const f=fixture(),a=await f.call('/auth/register',{username:'alice',password:'alice-password-123'}),b=await f.call('/auth/register',{username:'bobby',password:'bobby-password-123'});
 assert.equal((await f.call('/profile')).status,401);
 assert.deepEqual((await f.call('/profile',undefined,a.sessionToken)).profile,emptyProfile());
 const profile={displayName:'  Alice Jaga  ',team:'Regu A',workplace:'Kantor pusat',bio:'Tetap semangat.'};
 const input={profile,expectedRevision:0};
 const saved=await f.call('/profile',input,a.sessionToken,'PUT');assert.equal(saved.status,200);assert.equal(saved.profile.displayName,'Alice Jaga');assert.equal(saved.profile.revision,1);
 assert.deepEqual((await f.call('/profile',input,a.sessionToken,'PUT')).profile,saved.profile); // safe retry after lost acknowledgement
 assert.deepEqual((await f.call('/profile',undefined,b.sessionToken)).profile,emptyProfile());
 assert.deepEqual((await f.call('/auth/me',undefined,a.sessionToken)).user.profile,saved.profile);
 assert.equal((await f.call('/profile',{profile:{...profile,bio:'Changed'},expectedRevision:0},a.sessionToken,'PUT')).status,409);
 for(const invalid of [{...profile,displayName:'x'.repeat(81)},{...profile,bio:'bad\u0000text'},{...profile,photo:'data:image/png;base64,AA=='},{...profile,username:'bobby'},{...profile,toString:'oops'},{...profile,team:12}])assert.equal((await f.call('/profile',{profile:invalid,expectedRevision:1},a.sessionToken,'PUT')).status,400);
 assert.equal((await f.call('/profile',{...input,userId:'someone-else'},a.sessionToken,'PUT')).status,400);
 const attempts=await Promise.all(['One','Two'].map(displayName=>f.call('/profile',{profile:{...profile,displayName},expectedRevision:1},a.sessionToken,'PUT')));assert.deepEqual(attempts.map(v=>v.status).sort(),[200,409]);
 const user=f.tables.get('users').find(v=>v.username==='alice');assert.ok(user.passwordHash);assert.ok(user.recoveryHash);assert.equal(user.username,'alice');assert.equal(user.profile.photo,undefined);
 const state=(await f.call('/state',undefined,a.sessionToken)).data;assert.equal(state.revision,0);assert.deepEqual(state.events,[]);
 assert.equal((await f.call('/auth/login',{username:'alice',password:'alice-password-123'})).status,200);
});
test('legacy users can initialize profiles and the browser route rejects cross-origin updates',async()=>{
 const f=fixture();await f.database.collection('users').insertOne({_id:'owner',username:'legacy',passwordHash:await hashPassword('legacy-password-123')});
 const account=await f.call('/auth/login',{username:'legacy',password:'legacy-password-123'});
 const input={profile:{displayName:'Legacy User',team:'',workplace:'',bio:''},expectedRevision:0};
 const req=origin=>new Request('https://test.invalid/api/cloud/profile',{method:'PUT',headers:{origin,cookie:'__Host-jaga_session='+account.sessionToken},body:JSON.stringify(input)});
 assert.equal((await browserRequest(req('https://attacker.invalid'),f.handle,'test-key')).status,403);
 const response=await browserRequest(req('https://test.invalid'),f.handle,'test-key');assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await response.json()).profile.revision,1);
 assert.equal((await f.database.collection('users').findOne({_id:'owner'})).profile.displayName,'Legacy User');
});

test('finance backdating preserves server creation time, actor, audit and account isolation',async()=>{
 const f=fixture(),a=await f.call('/auth/register',{username:'alice',password:'alice-password-123'}),b=await f.call('/auth/register',{username:'bobby',password:'bobby-password-123'});
 const fields={type:'expense',date:'2026-01-01',amount:5000,category:'Minum',description:'Aqua',party:'Warung',method:'Tunai'};
 const input={action:'create',id:'transaction-00000001',operationId:'operation-00000001',expectedRevision:0,fields};
 assert.equal((await f.call('/finance')).status,401);
 const before=Date.now(),r=await f.call('/finance',input,a.sessionToken);assert.equal(r.status,200);
 const entry=r.data.entries[0];assert.equal(entry.date,'2026-01-01');assert.equal(entry.createdBy,'alice');assert.ok(Date.parse(entry.createdAt)>=before);assert.equal(entry.history.length,1);
 assert.deepEqual((await f.call('/finance',input,a.sessionToken)).data,r.data);
 assert.equal((await f.call('/finance',{...input,fields:{...fields,amount:9000}},a.sessionToken)).status,409);
 assert.deepEqual((await f.call('/finance',undefined,b.sessionToken)).data.entries,[]);
 assert.equal((await f.call('/finance',{...input,action:'edit'},b.sessionToken)).status,404);
 const edited=await f.call('/finance',{...input,action:'edit',operationId:'operation-00000002',expectedRevision:1,fields:{...fields,date:'2026-01-02',amount:6000}},a.sessionToken);
 assert.equal(edited.status,200);assert.equal(edited.data.entries[0].createdAt,entry.createdAt);assert.equal(edited.data.entries[0].history[1].before.amount,5000);
 assert.equal((await f.call('/finance',{...input,operationId:'operation-00000003',id:'transaction-00000002'},a.sessionToken)).status,409);
 const cancelled=await f.call('/finance',{action:'cancel',id:input.id,operationId:'operation-00000004',expectedRevision:2},a.sessionToken);
 assert.equal(cancelled.status,200);assert.equal(cancelled.data.entries[0].cancelled,true);assert.equal(cancelled.data.entries[0].history.length,3);
 assert.deepEqual((await f.call('/state',undefined,a.sessionToken)).data,emptyData());
});
test('finance validates amounts, dates and rejects forged recording metadata; writes are atomic',async()=>{
 const f=fixture(),a=await f.call('/auth/register',{username:'alice',password:'alice-password-123'});
 const fields={type:'income',date:'2026-01-01',amount:700000,category:'Pembayaran utang',description:'Bayar dari teman',party:'Budi',method:'Transfer'};
 const input={action:'create',id:'transaction-00000001',operationId:'operation-00000001',expectedRevision:0,fields};
 for(const patch of [{amount:0},{amount:-1},{amount:1.5},{date:'2026-02-30'},{date:'2099-01-01'},{createdAt:'2000-01-01'},{createdBy:'bobby'},{category:'Invalid'}])assert.equal((await f.call('/finance',{...input,fields:{...fields,...patch}},a.sessionToken)).status,400);
 assert.equal((await f.call('/finance',{...input,userId:'bobby'},a.sessionToken)).status,400);
 const results=await Promise.all([1,2].map(n=>f.call('/finance',{...input,id:'transaction-0000000'+n,operationId:'operation-0000000'+n},a.sessionToken)));
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const req=origin=>new Request('https://test.invalid/api/cloud/finance',{method:'POST',headers:{origin,cookie:'__Host-jaga_session='+a.sessionToken},body:JSON.stringify(input)});
 assert.equal((await browserRequest(req('https://evil.invalid'),f.handle,'test-key')).status,403);
 const result=await browserRequest(new Request('https://test.invalid/api/cloud/finance',{headers:{cookie:'__Host-jaga_session='+a.sessionToken}}),f.handle,'test-key');assert.equal(result.status,200);assert.equal((await result.json()).data.entries.length,1);
});

test('legacy paid duty remains readable without inventing payment amounts',async()=>{
 const f=fixture(),a=await f.call('/auth/register',{username:'alice',password:'alice-password-123'}),b=await f.call('/auth/register',{username:'bobby',password:'bobby-password-123'});
 const event={id:'duty-paid',type:'swap',personId:'peer',direction:'give',settlement:'paid',date:'2026-01-17',shift:'day',start:'2026-01-17T08:00:00+07:00',end:'2026-01-17T20:00:00+07:00',status:'realized',reason:'',notes:'',created:'2026-01-18T00:00:00Z',revision:1};
 const data={...emptyData(),anchor:'2026-01-12',revision:1,people:[{id:'peer',name:'Rekan',team:'',archived:false}],events:[event]};
 const account=f.tables.get('users').find(u=>u.username==='alice');
 await f.database.collection('states').updateOne({_id:account._id},{$set:{data}});
 assert.deepEqual((await f.call('/state',undefined,a.sessionToken)).data.events,[event]);
 assert.deepEqual((await f.call('/state',undefined,b.sessionToken)).data.events,[]);
 assert.deepEqual((await f.call('/finance',undefined,a.sessionToken)).data.entries,[]);
 const invalid={...data,revision:2,events:[{...event,settlement:'invalid'}]};
 assert.equal((await f.save(invalid,a.sessionToken,1,digest('bad-paid'))).status,400);
 assert.equal((await f.call('/state',undefined,a.sessionToken)).data.revision,1);
 const swapped={...data,revision:2,events:[{...event,settlement:'swap',revision:2}]};
 assert.equal((await f.save(swapped,a.sessionToken,1,digest('edit-paid'))).status,200);
 const restored=await f.call('/versions/restore',{revision:1,expectedRevision:2},a.sessionToken);assert.equal(restored.status,200);assert.equal(restored.data.events[0].settlement,'paid');
});

const paidState=()=>({...emptyData(),anchor:'2026-01-12',revision:1,people:[{id:'peer',name:'Budi',team:'A',archived:false}],events:[{id:'paid-event',type:'swap',personId:'peer',direction:'receive',settlement:'paid',payment:{amount:100000,date:'2026-01-12'},date:'2026-01-12',shift:'day',start:'2026-01-12T08:00:00+07:00',end:'2026-01-12T20:00:00+07:00',status:'realized',reason:'',notes:'',created:'2026-01-12T00:00:00Z',revision:1}]});
test('paid duty creates, edits, cancels and restores one linked cash entry atomically',async()=>{
 const f=fixture(),a=await f.call('/auth/register',{username:'alice',password:'alice-password-123'}),b=await f.call('/auth/register',{username:'bobby',password:'bobby-password-123'});
 let state=paidState();const start=Date.now();
 assert.equal((await f.save(state,a.sessionToken)).status,200);
 assert.equal((await f.save(state,a.sessionToken)).status,200);
 let book=(await f.call('/finance',undefined,a.sessionToken)).data,entry=book.entries[0];
 assert.equal(book.entries.length,1);assert.equal(book.revision,1);assert.equal(entry.type,'expense');assert.equal(entry.amount,100000);assert.equal(entry.sourceEventId,'paid-event');assert.equal(entry.createdBy,'alice');assert.ok(Date.parse(entry.createdAt)>=start);
 assert.deepEqual((await f.call('/finance',undefined,b.sessionToken)).data.entries,[]);
 // Linked entries cannot be edited independently, even through the API.
 assert.equal((await f.call('/finance',{action:'cancel',id:entry.id,operationId:'operation-cancel-duty',expectedRevision:1},a.sessionToken)).status,400);
 state={...state,revision:2,events:state.events.map(e=>({...e,payment:{amount:150000,date:'2026-01-11'}}))};
 assert.equal((await f.save(state,a.sessionToken,1,digest('edit-duty'))).status,200);
 book=(await f.call('/finance',undefined,a.sessionToken)).data;assert.equal(book.entries.length,1);assert.equal(book.entries[0].amount,150000);assert.equal(book.entries[0].date,'2026-01-11');assert.equal(book.entries[0].createdAt,entry.createdAt);assert.equal(book.entries[0].history.length,2);
 const financeFields={type:'expense',date:'2026-01-12',amount:5000,category:'Minum',description:'Aqua',party:'',method:'Tunai'};
 assert.equal((await f.call('/finance',{action:'create',id:'transaction-00000001',operationId:'operation-stale-cash',expectedRevision:1,fields:financeFields},a.sessionToken)).status,409);
 // Removing an event via backup restore also cancels its generated cash entry.
 assert.equal((await f.call('/versions/restore',{revision:0,expectedRevision:2},a.sessionToken)).status,200);
 book=(await f.call('/finance',undefined,a.sessionToken)).data;assert.equal(book.entries[0].cancelled,true);
 assert.equal((await f.call('/versions/restore',{revision:2,expectedRevision:3},a.sessionToken)).status,200);
 book=(await f.call('/finance',undefined,a.sessionToken)).data;assert.equal(book.entries.length,1);assert.equal(book.entries[0].cancelled,false);assert.equal(book.entries[0].history.at(-1).action,'restore');
 state={...(await f.call('/state',undefined,a.sessionToken)).data,revision:5};state.events=state.events.map(({payment,...e})=>({...e,settlement:'swap'}));
 assert.equal((await f.save(state,a.sessionToken,4,digest('switch-to-swap'))).status,200);
 assert.equal((await f.call('/finance',undefined,a.sessionToken)).data.entries[0].cancelled,true);
});
test('advance income on planned duty records payment now; invalid payment leaves both stores unchanged',async()=>{
 const f=fixture(),a=await f.call('/auth/register',{username:'alice',password:'alice-password-123'});
 let state=paidState();state.events=state.events.map(e=>({...e,direction:'give',date:'2099-01-01',start:'2099-01-01T08:00:00+07:00',end:'2099-01-01T20:00:00+07:00',status:'planned'}));
 // Use an off day so the extra shift does not overlap the owner's routine.
 state.anchor='2098-12-28';
 for(const payment of [undefined,{amount:0,date:'2026-01-12'},{amount:1.1,date:'2026-01-12'},{amount:100,date:'2099-01-01'},{amount:100,date:'2026-02-30'}]){
  assert.equal((await f.save({...state,events:state.events.map(e=>({...e,payment}))},a.sessionToken)).status,400);
  assert.deepEqual((await f.call('/finance',undefined,a.sessionToken)).data.entries,[]);
  assert.equal((await f.call('/state',undefined,a.sessionToken)).data.revision,0);
 }
 assert.equal((await f.save(state,a.sessionToken)).status,200);
 const book=(await f.call('/finance',undefined,a.sessionToken)).data;assert.equal(book.entries[0].type,'income');assert.equal(book.entries[0].date,'2026-01-12');
 // Fault after the finance write must roll it back along with the state.
 const original=f.database.collection;
 f.database.collection=name=>{const c=original(name);if(name==='versions')c.insertOne=async()=>{throw Error('simulated write failure');};return c;};
 assert.equal((await f.save({...state,revision:2,events:state.events.map(e=>({...e,payment:{...e.payment,amount:200000}}))},a.sessionToken,1,digest('fail-atomic'))).status,503);
 assert.deepEqual((await f.call('/finance',undefined,a.sessionToken)).data,book);
 assert.equal((await f.call('/state',undefined,a.sessionToken)).data.revision,1);
});
test('opening balance is account scoped, idempotent, includes historical exclusions and survives writes',async()=>{
 const f=fixture(),a=await f.call('/auth/register',{username:'alice',password:'alice-password-123'}),b=await f.call('/auth/register',{username:'bobby',password:'bobby-password-123'});
 const fields={type:'income',date:'2026-01-12',amount:700000,category:'Gaji',description:'Gaji lama',party:'',method:'Tunai'};
 await f.call('/finance',{action:'create',id:'transaction-00000001',operationId:'operation-00000001',expectedRevision:0,fields},a.sessionToken);
 const input={action:'opening',id:'opening-000000001',operationId:'opening-operation-001',expectedRevision:1,fields:{amount:269175,date:'2026-01-12'}};
 const r=await f.call('/finance',input,a.sessionToken);assert.equal(r.status,200);assert.equal(r.data.opening.amount,269175);assert.deepEqual(r.data.opening.excludedEntryIds,['transaction-00000001']);assert.equal(r.data.opening.createdBy,'alice');
 assert.deepEqual((await f.call('/finance',input,a.sessionToken)).data,r.data);
 assert.equal((await f.call('/finance',{...input,expectedRevision:2,operationId:'opening-operation-002'},a.sessionToken)).status,409);
 assert.equal((await f.call('/finance',undefined,b.sessionToken)).data.opening,undefined);
 await f.call('/finance',{action:'create',id:'transaction-00000002',operationId:'operation-00000002',expectedRevision:2,fields:{...fields,date:'2026-01-13',amount:10000}},a.sessionToken);
 assert.equal((await f.save(paidState(),a.sessionToken)).status,200);
 const book=(await f.call('/finance',undefined,a.sessionToken)).data;assert.deepEqual(book.opening,r.data.opening);
 assert.equal(runningBalance(book).current,179175);
 for(const fields of [{amount:1.5,date:'2026-01-12'},{amount:269175,date:'2099-01-12'},{amount:269175,date:'2026-01-12',createdBy:'alice'}])assert.equal((await f.call('/finance',{...input,expectedRevision:0,fields},b.sessionToken)).status,400);
});
