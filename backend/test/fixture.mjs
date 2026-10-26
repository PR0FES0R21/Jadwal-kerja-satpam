import {createAPI} from '../api.mjs';
import {digest} from '../security.mjs';
// A query-aware database double exercises actual routing, auth, revisions and
// transactions. No production records or real credentials are used here.
export function fixture(){
 const tables=new Map();let transactionTail=Promise.resolve();
 const get=(v,k)=>k.split('.').reduce((x,n)=>x?.[n],v);
 const match=(v,q)=>Object.entries(q).every(([k,x])=>x&&typeof x==='object'&&!(x instanceof Date)?('$exists'in x?(get(v,k)!==undefined)===x.$exists:'$gt'in x?get(v,k)>x.$gt:'$lte'in x?get(v,k)<=x.$lte:false):get(v,k)===x);
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
 async function call(path,body,session,method=body?'POST':'GET'){const headers={authorization:'Bearer test-key','x-jaga-client':'test-ip',...(session?{'x-jaga-session':session}:{}),'content-type':'application/json'};const r=await handle(new Request('https://test.invalid'+path,{headers,method,...(body?{body:JSON.stringify(body)}:{})}));return {status:r.status,...await r.json()};}
 async function save(data,session,expected=0,op=digest('save')){const r=await handle(new Request('https://test.invalid/state',{method:'PUT',headers:{authorization:'Bearer test-key','x-jaga-session':session},body:JSON.stringify({data,expectedRevision:expected,operationId:op})}));return {status:r.status,...await r.json()};}
 return {database,handle,call,save,tables};
}
