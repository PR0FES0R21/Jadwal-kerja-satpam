import test from 'node:test';
import assert from 'node:assert/strict';
import {GET,POST} from '../../app/api/cloud/[...path]/route.ts';
import {fixture} from './fixture.mjs';

test('Next proxy preserves report filters and paging, retains session isolation and rejects cross-origin writes',async()=>{
 const f=fixture(),user=await f.call('/auth/register',{username:'proxyuser',password:'proxy-password-123'});
 const other=await f.call('/auth/register',{username:'proxyother',password:'proxy-password-123'});
 const me=await f.database.collection('users').findOne({username:'proxyuser'}),date='2026-10-30';
 const entries=Array.from({length:23},(_,i)=>({id:'row-'+i,date,amount:100,type:'expense',category:'Makan',accountId:'bca',createdAt:date+'T10:00:00Z',cancelled:false}));
 entries.push({...entries[0],id:'wrong-wallet',accountId:'mandiri',amount:999},{...entries[0],id:'wrong-date',date:'2026-10-29',amount:999});
 await f.database.collection('finance').insertOne({_id:me._id,data:{revision:0,entries}});
 const original=globalThis.fetch,oldURL=process.env.JAGA_BACKEND_URL,oldKey=process.env.JAGA_API_KEY;
 process.env.JAGA_BACKEND_URL='https://backend.test';process.env.JAGA_API_KEY='test-key';
 const seen=[];
 globalThis.fetch=async(url,options)=>{seen.push(String(url));return f.handle(new Request(url,options));};
 try{
  const call=async(path,token=user.sessionToken)=>GET(new Request('https://app.test/api/cloud/'+path,{headers:{cookie:'__Host-jaga_session='+token,'x-jaga-session':'forged',authorization:'forged'}}),{params:Promise.resolve({path:path.split('?')[0].split('/')})});
  const page=await call(`finance/view?from=${date}&to=${date}&page=2&account=bca&category=Makan&scope=spending`),v=await page.json();
  assert.equal(page.status,200);assert.equal(v.page,2);assert.equal(v.entries.length,10);assert.equal(v.total,23);assert.equal(v.expense,2300);
  assert.equal(page.headers.get('cache-control'),'no-store');
  const report=await (await call(`finance/report?from=${date}&to=${date}&account=bca&category=Makan`)).json();assert.equal(report.report.expense,2300);assert.equal(report.report.dailyTotal,2300);
  assert.equal((await (await call(`finance/view?from=${date}&to=${date}`,other.sessionToken)).json()).total,0);
  assert.equal((await call('finance/view','')).status,401);
  const bad=await POST(new Request('https://app.test/api/cloud/finance',{method:'POST',headers:{origin:'https://attacker.test'},body:'{}'}),{params:Promise.resolve({path:['finance']})});assert.equal(bad.status,403);
  assert.equal(seen.every(url=>new URL(url).origin==='https://backend.test'),true);
 }finally{globalThis.fetch=original;if(oldURL===undefined)delete process.env.JAGA_BACKEND_URL;else process.env.JAGA_BACKEND_URL=oldURL;if(oldKey===undefined)delete process.env.JAGA_API_KEY;else process.env.JAGA_API_KEY=oldKey;}
});
