import {Data,emptyData,loadData,validateBackup} from './jaga';
import {updateSnapshot} from './offline';
export type CloudSession={user:{username:string}|null;};
export class CloudError extends Error{constructor(message:string,public status:number){super(message);}}
export async function cloud<T>(path:string,method='GET',body?:unknown):Promise<T>{
  if(typeof navigator!=='undefined'&&!navigator.onLine)throw new CloudError('Sedang offline. Isian belum disimpan; sambungkan internet lalu coba lagi.',503);
  let response:Response;
  try{response=await fetch('/api/cloud/'+path,{method,headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(70000)});}catch{throw new CloudError('Koneksi terputus. Isian tetap tersedia; coba simpan kembali.',503);}
  let value:Record<string,unknown>;try{value=await response.json();}catch{throw new CloudError('Server belum siap. Coba lagi.',503);}
  if(!response.ok)throw new CloudError(String(value.error||'Catatan belum tersimpan.'),response.status);
  return value as T;
}
export async function dataFingerprint(data:Data){const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(data)));return Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('');}
export async function saveCloud(next:Data,expected:number){const operationId=await dataFingerprint(next);const result=(await cloud<{data:Data}>('state','PUT',{data:next,expectedRevision:expected,operationId})).data;await updateSnapshot(result);return result;}
export function hasLocalData(data:Data){return !!(data.events.length||data.people.length||Object.keys(data.confirmations).length||data.audit.length||data.anchor!==emptyData().anchor);}
export async function legacyData(){return loadData();}
export function mergeLegacy(remote:Data,local:Data):Data{
  validateBackup(local);
  if(hasLocalData(remote)&&remote.anchor!==local.anchor)throw Error('Acuan jadwal berbeda. Unduh kedua cadangan sebelum memilih data yang akan dipulihkan.');
  function merge<T extends {id:string}>(a:T[],b:T[]){const map=new Map(a.map(v=>[v.id,v]));for(const item of b){const existing=map.get(item.id);if(existing&&JSON.stringify(existing)!==JSON.stringify(item))throw Error('Ada catatan yang berbeda dengan ID yang sama. Unduh cadangan perangkat ini dan periksa sebelum memulihkan.');if(!existing)map.set(item.id,item);}return [...map.values()];}
  const confirmations={...remote.confirmations};for(const [date,value]of Object.entries(local.confirmations)){if(confirmations[date]&&confirmations[date]!==value)throw Error('Konfirmasi jaga berbeda pada '+date+'. Periksa cadangan dahulu.');confirmations[date]=value;}
  return {...remote,anchor:hasLocalData(remote)?remote.anchor:local.anchor,people:merge(remote.people,local.people),events:merge(remote.events,local.events),confirmations,audit:merge(remote.audit,local.audit)};
}
export type Version={revision:number;savedAt:string;events:number;people:number};
