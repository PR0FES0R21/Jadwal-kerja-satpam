import {transactionKinds} from './transaction-kinds.ts';
import {today,validDate} from './jaga.ts';
import {dueDate} from './loans.ts';
import {accountBalance,requireAccount,categories,entryFields,type FinanceData,type FinanceEntry} from './finance.ts';
export type PayLaterAccount={id:string;name:string;limit:number;openingUsed?:number;restore:'installment'|'full';createdAt:string;createdBy:string;history?:any[]};
export type PayLaterPurchase={id:string;facilityId:string;transactionKind?:string;description:string;category:string;party:string;date:string;principal:number;monthly:number;tenor:number;firstDue:string;cancelled:boolean;createdAt:string;createdBy:string;history?:any[]};
export type PayLaterPayment={id:string;purchaseId:string;openingFacilityId?:string;principal?:number;numbers:number[];amount:number;date:string;accountId:string;cancelled:boolean;createdAt:string;createdBy:string;cancelledAt?:string;cancelledBy?:string};
export function payLaterRows(book:FinanceData,p:PayLaterPurchase){return Array.from({length:p.tenor},(_,i)=>{const number=i+1,principal=Math.floor(p.principal/p.tenor)+(i<p.principal%p.tenor?1:0),payment=book.payLaterPayments?.find(x=>!x.cancelled&&x.purchaseId===p.id&&x.numbers.includes(number));return {number,principal,amount:p.monthly,due:dueDate(p.firstDue,i),paid:!!payment};});}
export function payLaterBalance(book:FinanceData,id:string){
 const a=book.payLaterAccounts?.find(x=>x.id===id);
 const openingPaid=(book.payLaterPayments??[]).filter(p=>!p.cancelled&&p.openingFacilityId===id).reduce((n,p)=>n+(p.principal??0),0);
 const openingUsed=(a?.openingUsed??0)-openingPaid;
 const trackedUsed=(book.payLaterPurchases??[]).filter(p=>!p.cancelled&&p.facilityId===id).reduce((n,p)=>{const rows=payLaterRows(book,p);return n+(a?.restore==='full'?(rows.every(r=>r.paid)?0:p.principal):rows.filter(r=>!r.paid).reduce((s,r)=>s+r.principal,0));},0);
 const used=openingUsed+trackedUsed;
 return {used,available:(a?.limit??0)-used,openingUsed,openingPaid,trackedUsed};
}
// Credit purchases join transaction history without becoming cash ledger entries.
export function payLaterTransactions(book:FinanceData):FinanceEntry[]{
 return (book.payLaterPurchases??[]).map(p=>({id:'paylater:'+p.id,sourcePayLaterPurchaseId:p.id,accountId:'paylater:'+p.facilityId,type:'expense',date:p.date,amount:p.principal,category:p.category,description:p.description,party:p.party,method:'PayLater',transactionKind:p.transactionKind??'',cancelled:p.cancelled,createdAt:p.createdAt,createdBy:p.createdBy,updatedAt:p.history?.at(-1)?.at??p.createdAt,updatedBy:p.history?.at(-1)?.by??p.createdBy,history:[{at:p.createdAt,by:p.createdBy,action:'create',before:null},...(p.history??[]).map(h=>({at:h.at,by:h.by,action:h.action==='pl_cancel_purchase'?'cancel':'edit',before:h.before?{type:'expense' as const,date:h.before.date,amount:h.before.principal,category:h.before.category,description:h.before.description,party:h.before.party,method:'PayLater'}:null}))]}));
}
const obj=(v:any,keys:string[])=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!keys.includes(k)))throw Error('Kolom PayLater tidak valid.');};
const text=(v:any,max=100)=>{if(typeof v!=='string'||!v.trim()||v.length>max||/[\u0000-\u001f]/.test(v))throw Error('Isi keterangan dengan benar.');return v.trim();};
const amount=(v:any)=>{if(!Number.isSafeInteger(v)||v<=0||v>1e12)throw Error('Nominal harus rupiah bulat positif, maksimal 1 triliun.');return v as number;};
export function payLaterAction(book:FinanceData,action:string,id:string,v:any,actor:string,now:string):FinanceData{
 const accounts=book.payLaterAccounts??[],purchases=book.payLaterPurchases??[],payments=book.payLaterPayments??[],audit={createdAt:now,createdBy:actor},next={...book,revision:book.revision+1};
 if(action==='pl_account'||action==='pl_edit_account'){
  obj(v,['name','limit','restore','available']);const name=text(v.name,60),limit=amount(v.limit);if(!['installment','full'].includes(v.restore))throw Error('Pilih aturan pengembalian limit.');
  const old=accounts.find(a=>a.id===id);if(action==='pl_account'&&(old||accounts.length>=50))throw Error('PayLater sudah ada atau batas 50 tercapai.');if(action==='pl_edit_account'&&!old)throw Error('PayLater tidak ditemukan.');const balance=payLaterBalance(book,id);
  let openingUsed=old?.openingUsed??0;
  if(v.available!==undefined){
   if(!Number.isSafeInteger(v.available)||v.available<0||v.available>limit)throw Error('Sisa limit harus antara nol dan total limit.');
   const remaining=limit-v.available-balance.trackedUsed;
   if(remaining<0)throw Error('Sisa limit terlalu besar untuk transaksi aktif. Koreksi transaksi atau pembayarannya terlebih dahulu.');
   openingUsed=remaining+balance.openingPaid;
   if(!Number.isSafeInteger(openingUsed)||openingUsed>1e12)throw Error('Pemakaian awal melebihi batas nominal.');
  }else if(limit<balance.used)throw Error('Limit baru lebih kecil dari pemakaian aktif.');
  if(old&&old.restore!==v.restore&&purchases.some(p=>p.facilityId===id&&!p.cancelled&&payLaterRows(book,p).some(r=>!r.paid)))throw Error('Aturan pengembalian dapat diubah setelah transaksi aktif lunas.');
  const a={id,name,limit,openingUsed,restore:v.restore,...(old?{createdAt:old.createdAt,createdBy:old.createdBy,history:[...(old.history??[]),{at:now,by:actor,before:{name:old.name,limit:old.limit,restore:old.restore,openingUsed:old.openingUsed??0},after:{name,limit,openingUsed,restore:v.restore}}]}:audit)};
  return {...next,payLaterAccounts:[...accounts.filter(a=>a.id!==id),a]};
 }
 if(action==='pl_purchase'||action==='pl_edit_purchase'){
  obj(v,['facilityId','description','category','party','date','principal','monthly','tenor','firstDue','transactionKind']);
  const old=purchases.find(p=>p.id===id);if(action==='pl_purchase'&&(old||purchases.length>=1000))throw Error('Transaksi sudah ada atau batas 1.000 tercapai.');if(action==='pl_edit_purchase'&&(!old||old.cancelled))throw Error('Transaksi aktif tidak ditemukan.');
  if(old&&payments.some(p=>p.purchaseId===id&&!p.cancelled))throw Error('Batalkan pembayaran terlebih dahulu sebelum mengedit transaksi.');
  if(!accounts.some(a=>a.id===v.facilityId)||old&&old.facilityId!==v.facilityId)throw Error('PayLater tidak valid.');const principal=amount(v.principal),monthly=amount(v.monthly);
  if(!Number.isInteger(v.tenor)||v.tenor<1||v.tenor>120||principal<v.tenor||monthly*v.tenor<principal)throw Error('Periksa tenor dan cicilan; total tagihan minimal sebesar pokok.');amount(monthly*v.tenor);
  if(!validDate(v.date)||v.date>today()||!validDate(v.firstDue)||v.firstDue<v.date||!validDate(dueDate(v.firstDue,v.tenor-1)))throw Error('Periksa tanggal transaksi dan jatuh tempo pertama.');
  if(!categories.expense.includes(v.category)||typeof v.party!=='string'||v.party.length>100)throw Error('Kategori atau nama tidak valid.');
  if(v.transactionKind!==undefined&&(typeof v.transactionKind!=='string'||v.transactionKind&&!transactionKinds[v.category]?.includes(v.transactionKind)))throw Error('Jenis transaksi tidak sesuai kategori.');
  if(principal>payLaterBalance(book,v.facilityId).available+(old?.principal??0))throw Error('Limit tersedia tidak cukup.');
  const p:PayLaterPurchase={id,transactionKind:v.transactionKind??(old?.category===v.category?old.transactionKind??'':''),facilityId:v.facilityId,description:text(v.description,500),category:v.category,party:v.party.trim(),date:v.date,principal,monthly,tenor:v.tenor,firstDue:v.firstDue,cancelled:false,...audit,...(old?{createdAt:old.createdAt,createdBy:old.createdBy,history:[...(old.history??[]),{at:now,by:actor,action,before:{...old,history:undefined}}]}:{})};
  return {...next,payLaterPurchases:[...purchases.filter(p=>p.id!==id),p]};
 }
 if(action==='pl_cancel_purchase'){
  obj(v,[]);const p=purchases.find(p=>p.id===id&&!p.cancelled);if(!p)throw Error('Transaksi aktif tidak ditemukan.');if(payments.some(x=>x.purchaseId===id&&!x.cancelled))throw Error('Batalkan pembayaran terlebih dahulu.');
  return {...next,payLaterPurchases:purchases.map(x=>x.id===id?{...x,cancelled:true,history:[...(x.history??[]),{at:now,by:actor,action}]}:x)};
 }
 if(action==='pl_cancel_payment'){
  obj(v,[]);const p=payments.find(p=>p.id===id&&!p.cancelled);if(!p)throw Error('Pembayaran aktif tidak ditemukan.');
  return {...next,payLaterPayments:payments.map(x=>x.id===id?{...x,cancelled:true,cancelledAt:now,cancelledBy:actor}:x),entries:book.entries.map(e=>e.sourcePayLaterPaymentId===id?{...e,cancelled:true,updatedAt:now,updatedBy:actor,history:[...e.history,{at:now,by:actor,action:'cancel',before:entryFields(e)}]}:e)};
 }
 if(action!=='pl_pay'&&action!=='pl_pay_opening')throw Error('Tindakan PayLater tidak valid.');
 const opening=action==='pl_pay_opening';
 obj(v,opening?['facilityId','principal','fee','accountId','date']:['purchaseId','numbers','accountId','date']);
 const p=opening?undefined:purchases.find(p=>p.id===v.purchaseId&&!p.cancelled);
 const facility=accounts.find(a=>a.id===(opening?v.facilityId:p?.facilityId));
 if(!facility||!opening&&!p)throw Error('Transaksi atau PayLater aktif tidak ditemukan.');
 if(payments.some(x=>x.id===id)||book.entries.some(e=>e.id===id))throw Error('Pembayaran sudah tercatat.');
 let total:number,principal:number|undefined;
 if(opening){
  principal=amount(v.principal);
  if(principal>payLaterBalance(book,facility.id).openingUsed)throw Error('Pembayaran pokok melebihi sisa pemakaian sebelumnya.');
  if(!Number.isSafeInteger(v.fee)||v.fee<0||v.fee>1e12)throw Error('Biaya harus rupiah bulat, minimal nol.');
  total=amount(principal+v.fee);
 }else{
  if(!Array.isArray(v.numbers)||!v.numbers.length||v.numbers.length>p!.tenor||new Set(v.numbers).size!==v.numbers.length)throw Error('Pilih cicilan yang valid.');
  const rows=payLaterRows(book,p!);const picked=v.numbers.map((n:number)=>{const row=rows.find(r=>r.number===n);if(!row||row.paid)throw Error('Cicilan sudah dibayar atau tidak ditemukan.');return row;});total=amount(picked.reduce((n:number,r:any)=>n+r.amount,0));
 }
 if(!validDate(v.date)||v.date>today()||p&&v.date<p.date)throw Error('Tanggal pembayaran tidak valid.');
 const account=requireAccount(book,v.accountId,v.date);if(!account.opening||v.date<account.opening.date)throw Error('Atur saldo awal sebelum tanggal pembayaran.');if((accountBalance(book,account.id).current??0)<total)throw Error('Saldo rekening tidak cukup.');if(book.entries.length>=5000||payments.length>=5000)throw Error('Batas transaksi tercapai.');
 const payment:PayLaterPayment={id,purchaseId:p?.id??'',...(opening?{openingFacilityId:facility.id,principal}:{}),numbers:opening?[]:v.numbers,amount:total,date:v.date,accountId:account.id,cancelled:false,...audit};
 const entry:FinanceEntry={id,sourcePayLaterPaymentId:id,type:'expense',category:'Cicilan',description:`PayLater · ${p?.description??'Pemakaian sebelumnya'}`,party:facility.name,method:'Pelunasan PayLater',amount:total,date:v.date,accountId:account.id,cancelled:false,...audit,updatedAt:now,updatedBy:actor,history:[{at:now,by:actor,action:'create',before:null}]};
 return {...next,payLaterPayments:[...payments,payment],entries:[...book.entries,entry]};
}
