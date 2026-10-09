import {Data,validateBackup} from './jaga';
import {Profile} from './profile';
export type Snapshot={username:string;data:Data;profile?:Profile;savedAt:string};
const database='jaga-cloud-offline-v1';
async function access<T>(mode:IDBTransactionMode,action:(store:IDBObjectStore)=>IDBRequest):Promise<T>{
  return new Promise((resolve,reject)=>{
    const open=indexedDB.open(database,1);
    open.onupgradeneeded=()=>open.result.createObjectStore('snapshot');
    open.onerror=()=>reject(open.error);
    open.onsuccess=()=>{
      const db=open.result,transaction=db.transaction('snapshot',mode),request=action(transaction.objectStore('snapshot'));
      transaction.oncomplete=()=>{db.close();resolve(request.result as T);};
      transaction.onerror=()=>{db.close();reject(transaction.error);};
      transaction.onabort=()=>{db.close();reject(transaction.error);};
    };
  });
}
export async function readSnapshot():Promise<Snapshot|null>{
  try{const value=await access<Snapshot|undefined>('readonly',s=>s.get('active'));
    if(!value||typeof value.username!=='string'||!Number.isFinite(Date.parse(value.savedAt))||Date.now()-Date.parse(value.savedAt)>90*86400000)return null;
    validateBackup(value.data);return value;
  }catch{return null;}
}
export async function rememberSnapshot(username:string,data:Data,profile?:Profile){
  try{validateBackup(data);await access('readwrite',s=>s.put({username,data,profile,savedAt:new Date().toISOString()},'active'));return true;}catch{return false;}
}
export async function updateSnapshot(data:Data){const current=await readSnapshot();if(current)await rememberSnapshot(current.username,data,current.profile);}
export async function clearSnapshot(){try{await access('readwrite',s=>s.delete('active'));}catch{}}

export async function updateProfileSnapshot(username:string,profile:Profile){const current=await readSnapshot();if(current?.username===username){try{await access('readwrite',s=>s.put({...current,profile},'active'));}catch{}}}
