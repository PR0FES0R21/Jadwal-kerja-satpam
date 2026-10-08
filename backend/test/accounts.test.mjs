import test from 'node:test';
import assert from 'node:assert/strict';
import {createAPI} from '../api.mjs';
import {browserRequest} from '../browser.mjs';
import {emptyData} from '../../lib/jaga.ts';
import {digest,token,hashPassword} from '../security.mjs';
// A query-aware database double exercises actual routing, auth, revisions and
// transactions. No production records or real credentials are used here.
function fixture(){
 const tables=new Map();let transactionTail=Promise.resolve();
 const get=(v,k)=>k.split('.').reduce((x,n)=>x?.[n],v);
 const match=(v,q)=>Object.entries(q).every(([k,x])=>x&&typeof x==='object'&&!(x instanceof Date)?('$gt'in x?get(v,k)>x.$gt:'$lte'in x?get(v,k)<=x.$lte:false):get(v,k)===x);
 const set=(v,k,x)=>{const parts=k.split('.');const last=parts.pop();const o=parts.reduce((a,p)=>a[p]??=( {}),v);o[last]=x;};
 const database={collection(name){const rows=tables.get(name)??[];tables.set(name,rows);return {
  async findOne(q){return structuredClone(rows.find(v=>match(v,q))??null);},
  async insertOne(v){if(rows.some(r=>r._id===v._id&&v._id!==undefined||name==='users'&&r.username===v.username||name==='versions'&&r.userId===v.userId&&r.revision===v.revision))throw Object.assign(Error('duplicate'),{code:11000});rows.push(structuredClone(v));},
  async updateOne(q,u,options={}){let v=rows.find(v=>match(v,q));const existed=!!v;if(!v&&options.upsert){v={...q,...u.$setOnInsert};rows.push(v);}if(!v)return {matchedCount:0};for(const [k,x]of Object.entries(u.$set??{}))set(v,k,structuredClone(x));for(const [k,x]of Object.entries(u.$inc??{}))set(v,k,(get(v,k)??0)+x);return {matchedCount:existed?1:0};},
  async findOneAndUpdate(q,u,o){await this.updateOne(q,u,o);return this.findOne(q);},
  async deleteOne(q){const n=rows.findIndex(v=>match(v,q));if(n>=0)rows.splice(n,1);},
  async deleteMany(q){for(let i=rows.length-1;i>=0;i--)if(match(rows[i],q))rows.splice(i,1);},
  find(q){let a=rows.filter(v=>match(v,q));return {sort(){a.sort((x,y)=>y.revision-x.revision);return this;},limit(n){a=a.slice(0,n);return this;},async toArray(){return structuredClone(a);}}},
 };},async command(){}};
 const client={startSession(){return {async withTransaction(fn){const prev=transactionTail;let done;transactionTail=new Promise(r=>done=r);await prev;const backup=structuredClone([...tables]);try{return await fn();}catch(e){for(const [key,rows]of tables){rows.splice(0,rows.length,...(backup.find(([k])=>k===key)?.[1]??[]));}throw e;}finally{done();}},async endSession(){}};}};
 const handle=createAPI({uri:'test-only',apiKey:'test-key',connectDatabase:async()=>({database,client})});
 async function call(path,body,session){const headers={authorization:'Bearer test-key','x-jaga-client':'test-ip',...(session?{'x-jaga-session':session}:{}),'content-type':'application/json'};const r=await handle(new Request('https://test.invalid'+path,{headers,method:body?'POST':'GET',...(body?{body:JSON.stringify(body)}:{})}));return {status:r.status,...await r.json()};}
 async function save(data,session,expected=0,op=digest('save')){const r=await handle(new Request('https://test.invalid/state',{method:'PUT',headers:{authorization:'Bearer test-key','x-jaga-session':session},body:JSON.stringify({data,expectedRevision:expected,operationId:op})}));return {status:r.status,...await r.json()};}
 return {database,handle,call,save,tables};
}
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
