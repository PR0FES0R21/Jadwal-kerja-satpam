import test from 'node:test';
import assert from 'node:assert/strict';
import {createAPI} from '../api.mjs';
import handler,{config} from '../netlify/functions/jaga.mjs';
const request=(path,headers={})=>new Request('https://backend.example.test'+path,{headers});
test('Netlify entry handles real Request/Response and requires secret for data',async()=>{
  const old=globalThis.Netlify;
  globalThis.Netlify={env:{get:key=>({JAGA_API_KEY:'test-only-key'}[key])}};
  try{
    const health=await handler(request('/health'));assert.equal(health.status,200);assert.deepEqual(await health.json(),{status:'running'});assert.equal(health.headers.get('cache-control'),'no-store');
    for(const path of ['/state','/ready','/versions','/auth/me'])assert.equal((await handler(request(path))).status,401);
    const missing=await handler(request('/state',{authorization:'Bearer test-only-key'}));assert.equal(missing.status,503);assert.equal((await missing.json()).error,'Konfigurasi server belum lengkap.');
  }finally{globalThis.Netlify=old;}
});
test('separate API configuration cannot accept a different instance secret',async()=>{
  const a=createAPI({apiKey:'first-test-key'}),b=createAPI({apiKey:'second-test-key'});
  assert.equal((await a(request('/state',{authorization:'Bearer second-test-key'}))).status,401);
  assert.equal((await b(request('/state',{authorization:'Bearer first-test-key'}))).status,401);
  assert.deepEqual(config.method,['GET','POST','PUT']);
  assert.ok(config.path.includes('/health')&&config.path.includes('/state')&&config.path.includes('/auth/*'));
});
