import type {Data} from './jaga.ts';
import {validDate,today,isPaidSwap} from './jaga.ts';
export const categories={income:['Gaji','Pembayaran utang','Pemberian','Bonus','Jaga dibayar','Lainnya'],expense:['Makan','Minum','Belanja','Kos','Transportasi','Cicilan','Jaga dibayar','Lainnya']};
export type FinanceFields={type:'income'|'expense';date:string;amount:number;category:string;description:string;party:string;method:string};
export type FinanceEntry=FinanceFields&{id:string;sourceEventId?:string;createdAt:string;createdBy:string;updatedAt:string;updatedBy:string;cancelled:boolean;history:{at:string;by:string;action:string;before:FinanceFields|null}[]};
export type OpeningBalance={amount:number;date:string;createdAt:string;createdBy:string;excludedEntryIds:string[]};
export type FinanceData={revision:number;entries:FinanceEntry[];opening?:OpeningBalance};
export function financeFields(input:unknown):FinanceFields{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Transaksi tidak valid.');
 const v=input as Record<string,unknown>;
 if(Object.keys(v).some(k=>!['type','date','amount','category','description','party','method'].includes(k)))throw Error('Kolom transaksi tidak valid.');
 if(v.type!=='income'&&v.type!=='expense')throw Error('Pilih jenis transaksi.');
 if(typeof v.date!=='string'||!validDate(v.date)||v.date>today())throw Error('Pilih tanggal aktivitas yang valid, maksimal hari ini (WIB).');
 if(!Number.isSafeInteger(v.amount)||(v.amount as number)<=0||(v.amount as number)>1_000_000_000_000)throw Error('Nominal harus rupiah bulat, lebih dari nol, maksimal 1 triliun.');
 for(const [key,max] of [['category',60],['description',500],['party',100],['method',60]] as const)if(typeof v[key]!=='string'||(v[key] as string).length>max||/[\u0000-\u001f]/.test(v[key] as string))throw Error('Keterangan transaksi tidak valid.');
 if(!categories[v.type].includes(v.category as string)||!(v.description as string).trim())throw Error('Isi kategori dan keterangan transaksi.');
 return {type:v.type,date:v.date,amount:v.amount as number,category:v.category as string,description:(v.description as string).trim(),party:(v.party as string).trim(),method:(v.method as string).trim()};
}

export function openingFields(input:unknown):{amount:number;date:string}{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Saldo awal tidak valid.');
 const v=input as Record<string,unknown>;
 if(Object.keys(v).some(k=>!['amount','date'].includes(k))||!Number.isSafeInteger(v.amount)||Math.abs(v.amount as number)>1_000_000_000_000||typeof v.date!=='string'||!validDate(v.date)||v.date>today())throw Error('Isi saldo awal rupiah bulat dan tanggal maksimal hari ini (WIB).');
 return {amount:v.amount as number,date:v.date};
}
export const entryFields=(entry:FinanceEntry):FinanceFields=>({type:entry.type,date:entry.date,amount:entry.amount,category:entry.category,description:entry.description,party:entry.party,method:entry.method});
// The same event always owns the same cash entry. Run inside the state transaction.
export function syncDutyFinance(book:FinanceData,state:Data,actor:string,now:string):FinanceData{
 const desired=new Map<string,FinanceFields>();
 for(const e of state.events){
  if(!isPaidSwap(e)||!e.payment||e.status==='cancelled')continue;
  const party=state.people.find(p=>p.id===e.personId)?.name??'Rekan';
  desired.set(e.id,{type:e.direction==='give'?'income':'expense',date:e.payment.date,amount:e.payment.amount,category:'Jaga dibayar',description:`${e.direction==='give'?'Menaikkan':'Dinaikkan'} ${party} · jaga ${e.date}`,party,method:'Tunai'});
 }
 let changed=false;
 const entries=book.entries.map(old=>{
  if(!old.sourceEventId)return old;
  const fields=desired.get(old.sourceEventId);desired.delete(old.sourceEventId);
  const cancelled=!fields;
  if(old.cancelled===cancelled&&(!fields||JSON.stringify(entryFields(old))===JSON.stringify(fields)))return old;
  changed=true;
  return {...old,...fields,cancelled,updatedAt:now,updatedBy:actor,history:[...old.history,{at:now,by:actor,action:cancelled?'cancel':old.cancelled?'restore':'edit',before:entryFields(old)}]};
 });
 for(const [sourceEventId,fields] of desired){
  changed=true;entries.push({...fields,id:'duty:'+sourceEventId,sourceEventId,createdAt:now,createdBy:actor,updatedAt:now,updatedBy:actor,cancelled:false,history:[{at:now,by:actor,action:'create',before:null}]});
 }
 if(entries.length>5000&&entries.length>book.entries.length)throw Error('Batas 5.000 transaksi tercapai.');
 return changed?{...book,revision:book.revision+1,entries}:book;
}
export function runningBalance(book:FinanceData){
 const opening=book.opening,balances:Record<string,number>={};
 if(!opening)return {current:null,balances};
 const excluded=new Set(opening.excludedEntryIds);
 let current=opening.amount;
 const entries=book.entries.filter(e=>!e.cancelled&&e.date>=opening.date&&!excluded.has(e.id)).sort((a,b)=>a.date.localeCompare(b.date)||a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
 for(const e of entries){current+=e.type==='income'?e.amount:-e.amount;balances[e.id]=current;}
 return {current,balances};
}
