import {transactionKinds} from './transaction-kinds.ts';
import type {PayLaterAccount,PayLaterPurchase,PayLaterPayment} from './paylater.ts';
import type {Loan} from './loans.ts';
import type {Data} from './jaga.ts';
import {validDate,today,isPaidSwap} from './jaga.ts';
export const categories={income:['Gaji','Pembayaran utang','Pemberian','Bonus','Jaga dibayar','Lainnya'],expense:['Makan','Minum','Belanja','Kos','Transportasi','Cicilan','Jaga dibayar','Lainnya']};
export type FinanceFields={type:'income'|'expense';date:string;amount:number;category:string;description:string;party:string;method:string;accountId?:string;debtPersonId?:string;transactionKind?:string};
export type FinanceEntry=FinanceFields&{id:string;sourcePayLaterPaymentId?:string;sourceLoanPaymentId?:string;sourceLoanId?:string;transferId?:string;transferFeeFor?:string;sourceEventId?:string;createdAt:string;createdBy:string;updatedAt:string;updatedBy:string;cancelled:boolean;history:{at:string;by:string;action:string;before:FinanceFields|null}[]};
export type OpeningBalance={amount:number;date:string;createdAt:string;createdBy:string;excludedEntryIds:string[]};
export type FinanceData={revision:number;entries:FinanceEntry[];opening?:OpeningBalance;accounts?:MoneyAccount[];loans?:Loan[];payLaterAccounts?:PayLaterAccount[];payLaterPurchases?:PayLaterPurchase[];payLaterPayments?:PayLaterPayment[]};
export function financeFields(input:unknown):FinanceFields{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Transaksi tidak valid.');
 const v=input as Record<string,unknown>;
 if(Object.keys(v).some(k=>!['type','date','amount','category','description','party','method','accountId','debtPersonId','transactionKind'].includes(k)))throw Error('Kolom transaksi tidak valid.');
 if(v.type!=='income'&&v.type!=='expense')throw Error('Pilih jenis transaksi.');
 if(typeof v.date!=='string'||!validDate(v.date)||v.date>today())throw Error('Pilih tanggal aktivitas yang valid, maksimal hari ini (WIB).');
 if(!Number.isSafeInteger(v.amount)||(v.amount as number)<=0||(v.amount as number)>1_000_000_000_000)throw Error('Nominal harus rupiah bulat, lebih dari nol, maksimal 1 triliun.');
 for(const [key,max] of [['category',60],['description',500],['party',100],['method',60]] as const)if(typeof v[key]!=='string'||(v[key] as string).length>max||/[\u0000-\u001f]/.test(v[key] as string))throw Error('Keterangan transaksi tidak valid.');
 if(!categories[v.type].includes(v.category as string)||!(v.description as string).trim())throw Error('Isi kategori dan keterangan transaksi.');
 if(v.accountId!==undefined&&(typeof v.accountId!=='string'||! /^[a-zA-Z0-9-]{1,80}$/.test(v.accountId)))throw Error('Rekening tidak valid.');
 if(v.debtPersonId!==undefined&&(typeof v.debtPersonId!=='string'||v.debtPersonId.length>80||! /^[a-zA-Z0-9-]*$/.test(v.debtPersonId)))throw Error('Pembayar tidak valid.');
 if(v.transactionKind!==undefined&&(typeof v.transactionKind!=='string'||v.transactionKind&&!transactionKinds[v.category as string]?.includes(v.transactionKind)))throw Error('Jenis transaksi tidak sesuai kategori.');
 return {transactionKind:(v.transactionKind as string)||'',debtPersonId:(v.debtPersonId as string)||'',...(v.accountId?{accountId:v.accountId as string}:{}),type:v.type,date:v.date,amount:v.amount as number,category:v.category as string,description:(v.description as string).trim(),party:(v.party as string).trim(),method:(v.method as string).trim()};
}

export function openingFields(input:unknown):{amount:number;date:string}{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Saldo awal tidak valid.');
 const v=input as Record<string,unknown>;
 if(Object.keys(v).some(k=>!['amount','date'].includes(k))||!Number.isSafeInteger(v.amount)||Math.abs(v.amount as number)>1_000_000_000_000||typeof v.date!=='string'||!validDate(v.date)||v.date>today())throw Error('Isi saldo awal rupiah bulat dan tanggal maksimal hari ini (WIB).');
 return {amount:v.amount as number,date:v.date};
}
export const entryFields=(entry:FinanceEntry):FinanceFields=>({...(entry.transactionKind?{transactionKind:entry.transactionKind}:{}),...(entry.debtPersonId?{debtPersonId:entry.debtPersonId}:{}),type:entry.type,date:entry.date,amount:entry.amount,category:entry.category,description:entry.description,party:entry.party,method:entry.method,...(entry.accountId?{accountId:entry.accountId}:{})});
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
  const fields=desired.get(old.sourceEventId);if(fields&&old.accountId)fields.accountId=old.accountId;desired.delete(old.sourceEventId);
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
function singleBalance(book:FinanceData){
 const opening=book.opening,balances:Record<string,number>={};
 if(!opening)return {current:null,balances};
 const excluded=new Set(opening.excludedEntryIds);
 let current=opening.amount;
 const entries=book.entries.filter(e=>!e.cancelled&&e.date>=opening.date&&!excluded.has(e.id)).sort((a,b)=>a.date.localeCompare(b.date)||a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
 for(const e of entries){current+=e.type==='income'?e.amount:-e.amount;balances[e.id]=current;}
 return {current,balances};
}

export type MoneyAccount={id:string;name:string;kind:'bank'|'ewallet'|'cash';opening?:OpeningBalance;archived?:boolean};
// Legacy records belong to Mandiri. This projection never rewrites their audit.
export function moneyAccounts(book:FinanceData):MoneyAccount[]{return [{id:'mandiri',name:'Bank Mandiri',kind:'bank',opening:book.opening},...(book.accounts??[])];}
export function accountBalance(book:FinanceData,id:string){const account=moneyAccounts(book).find(a=>a.id===id);return singleBalance({...book,opening:account?.opening,entries:book.entries.filter(e=>(e.accountId??'mandiri')===id)});}
export function runningBalance(book:FinanceData){
 const accounts=moneyAccounts(book),results=accounts.map(a=>accountBalance(book,a.id));
 return {current:results.some(r=>r.current!==null)?results.reduce((n,r)=>n+(r.current??0),0):null,balances:Object.assign({},...results.map(r=>r.balances)) as Record<string,number>};
}
export function requireAccount(book:FinanceData,id:string,date?:string){
 const a=moneyAccounts(book).find(a=>a.id===id);if(!a||a.archived)throw Error('Rekening aktif tidak ditemukan.');
 if(date&&id!=='mandiri'&&(!a.opening||date<a.opening.date))throw Error('Tanggal transaksi sebelum saldo awal rekening.');return a;
}
export function walletAction(book:FinanceData,action:string,id:string,input:any,actor:string,now:string):FinanceData{
 const audit={createdAt:now,createdBy:actor},accounts=book.accounts??[];
 if(action==='account'){
  if(!input||Object.keys(input).some(k=>!['name','kind','amount','date'].includes(k))||typeof input.name!=='string'||!input.name.trim()||input.name.length>60||!['bank','ewallet','cash'].includes(input.kind))throw Error('Isi nama dan jenis rekening.');
  if(moneyAccounts(book).some(a=>a.id===id||a.name.toLowerCase()===input.name.trim().toLowerCase()))throw Error('Rekening sudah ada.');
  if(accounts.length>=50)throw Error('Maksimal 50 rekening tambahan.');
  const opening=openingFields({amount:input.amount,date:input.date});
  return {...book,revision:book.revision+1,accounts:[...accounts,{id,name:input.name.trim(),kind:input.kind,opening:{...opening,...audit,excludedEntryIds:[]}}]};
 }
 if(action==='archive'){
  if(id==='mandiri')throw Error('Mandiri adalah rekening default dan tidak dapat diarsipkan.');
  const a=requireAccount(book,id);if(accountBalance(book,id).current!==0)throw Error('Pindahkan seluruh saldo sebelum mengarsipkan.');
  return {...book,revision:book.revision+1,accounts:accounts.map(x=>x.id===a.id?{...x,archived:true,archivedAt:now,archivedBy:actor}:x)};
 }
 if(action==='transfer'){
  if(!input||Object.keys(input).some(k=>!['from','to','amount','fee','date','description'].includes(k))||input.from===input.to)throw Error('Pilih dua rekening berbeda.');
  const from=requireAccount(book,input.from,input.date),to=requireAccount(book,input.to,input.date);if(!from.opening||!to.opening||input.date<from.opening.date||input.date<to.opening.date)throw Error('Atur saldo awal kedua rekening sebelum tanggal transfer.');
  if(!Number.isSafeInteger(input.fee)||input.fee<0||input.fee>1e12)throw Error('Biaya admin tidak valid.');
  const base=financeFields({type:'expense',date:input.date,amount:input.amount,category:'Lainnya',description:input.description||'Transfer antar rekening',party:'',method:'Transfer'});
  const available=accountBalance(book,input.from).current;if(available===null||available<base.amount+input.fee)throw Error('Saldo rekening asal tidak cukup.');
  if(book.entries.some(e=>e.transferId===id))throw Error('Transfer sudah tercatat.');
  const make=(suffix:string,type:'income'|'expense',accountId:string,amount:number,fee=false):FinanceEntry=>({...base,type,accountId,amount,id:id+suffix,...(!fee?{transferId:id}:{}),...audit,updatedAt:now,updatedBy:actor,cancelled:false,history:[{at:now,by:actor,action:'create',before:null}],description:fee?'Biaya admin transfer':base.description});
  const entries=[make('-out','expense',input.from,base.amount),make('-in','income',input.to,base.amount),...(input.fee?[make('-fee','expense',input.from,input.fee,true)]:[])];
  // Fee is grouped for atomic cancellation, while remaining a real expense.
  if(input.fee)entries[2].transferFeeFor=id;
  if(book.entries.length+entries.length>5000)throw Error('Batas 5.000 transaksi tercapai.');
  return {...book,revision:book.revision+1,entries:[...book.entries,...entries]};
 }
 if(action==='cancel_transfer'){
  if(!book.entries.some(e=>e.transferId===id&&!e.cancelled))throw Error('Transfer aktif tidak ditemukan.');
  return {...book,revision:book.revision+1,entries:book.entries.map(e=>e.transferId===id||e.transferFeeFor===id?{...e,cancelled:true,updatedAt:now,updatedBy:actor,history:[...e.history,{at:now,by:actor,action:'cancel',before:entryFields(e)}]}:e)};
 }
 if(action==='move_account'){
  if(!input||Object.keys(input).some(k=>k!=='accountId'))throw Error('Rekening tidak valid.');
  const e=book.entries.find(e=>e.id===id&&!e.cancelled);if(!e||e.sourceLoanPaymentId||e.sourcePayLaterPaymentId||e.transferId||e.transferFeeFor)throw Error('Transaksi tidak dapat dipindahkan.');requireAccount(book,input.accountId,e.date);
  if(moneyAccounts(book).some(a=>a.id===(e.accountId??'mandiri')&&a.opening&&(a.opening.excludedEntryIds.includes(id)||e.date<a.opening.date)))throw Error('Transaksi ini sudah tercakup dalam saldo awal.');
  return {...book,revision:book.revision+1,entries:book.entries.map(x=>x.id===id?{...x,accountId:input.accountId,updatedAt:now,updatedBy:actor,history:[...x.history,{at:now,by:actor,action:'edit',before:entryFields(x)}]}:x)};
 }
 throw Error('Tindakan rekening tidak valid.');
}
