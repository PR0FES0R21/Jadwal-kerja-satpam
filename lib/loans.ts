import {debtPeople,ownerId as debtOwnerId} from './debt.ts';
import {today,validDate} from './jaga.ts';
import {accountBalance,requireAccount,entryFields,type FinanceData,type FinanceEntry} from './finance.ts';
export type LoanSide='borrower'|'platform';
export type LoanPayment={id:string;side:LoanSide;date:string;amount:number;allocations:{number:number;amount:number}[];accountId?:string;historical:boolean;note:string;createdAt:string;createdBy:string;cancelled:boolean;cancelledAt?:string;cancelledBy?:string};
export type Loan={id:string;title:string;borrower:string;ownerId?:string;platform:string;principal:number;monthly:number;tenor:number;date:string;firstDue:string;dueDay?:number;notes:string;createdAt:string;createdBy:string;payments:LoanPayment[];schedule?:{number:number;amount:number;due:string}[];archived?:boolean;voided?:{at:string;by:string;reason:string};history?:{at:string;by:string;action:string;before:any;reason?:string}[]};
// Older releases used archive for the same user-facing Delete action.
export const isVoidedLoan=(loan:Loan)=>!!(loan.archived||loan.voided);
export function dueDate(first:string,offset:number,anchor?:number){const [y,m,d]=first.split('-').map(Number);const last=new Date(Date.UTC(y,m+offset,0)).getUTCDate();return new Date(Date.UTC(y,m-1+offset,Math.min(anchor??d,last))).toISOString().slice(0,10);}
export function installments(loan:Loan){return Array.from({length:loan.tenor},(_,i)=>{const number=i+1,paid=(side:LoanSide)=>loan.payments.filter(p=>!p.cancelled&&p.side===side).reduce((sum,p)=>sum+p.allocations.filter(a=>a.number===number).reduce((n,a)=>n+a.amount,0),0);const borrowerPaid=paid('borrower'),platformPaid=paid('platform'),saved=loan.schedule?.find(r=>r.number===number),amount=saved?.amount??loan.monthly;return {number,due:saved?.due??dueDate(loan.firstDue,i,loan.dueDay),amount,borrowerPaid,platformPaid,borrowerRemaining:amount-borrowerPaid,platformRemaining:amount-platformPaid};});}
export function loanSummary(loan:Loan,at=today()){const rows=isVoidedLoan(loan)?[]:installments(loan);return {borrower:rows.reduce((n,r)=>n+r.borrowerRemaining,0),platform:rows.reduce((n,r)=>n+r.platformRemaining,0),advanced:rows.reduce((n,r)=>n+Math.max(0,r.platformPaid-r.borrowerPaid),0),due:rows.filter(r=>r.due.slice(0,7)===at.slice(0,7)).reduce((n,r)=>n+r.platformRemaining,0),overdue:rows.filter(r=>r.due<at).reduce((n,r)=>n+r.platformRemaining,0)};}
function object(v:any,keys:string[]){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!keys.includes(k)))throw Error('Kolom pinjaman tidak valid.');}
function str(v:any,max:number,required=true){if(typeof v!=='string'||v.length>max||/[\u0000-\u001f]/.test(v)||(required&&!v.trim()))throw Error('Isi nama dan keterangan dengan benar.');return v.trim();}
function amount(v:any){if(!Number.isSafeInteger(v)||v<=0||v>1e12)throw Error('Nominal harus rupiah bulat, lebih dari nol, maksimal 1 triliun.');return v as number;}
export function loanAction(book:FinanceData,action:string,id:string,input:any,actor:string,now:string):FinanceData{
 const loans=book.loans??[],audit={createdAt:now,createdBy:actor};
 if(action==='loan_opening'){
  object(input,['loanId','date','platform','receipts','note']);
  const loan=loans.find(l=>l.id===input.loanId);if(!loan||isVoidedLoan(loan))throw Error('Pinjaman aktif tidak ditemukan.');
  if(!Array.isArray(input.platform)||!Array.isArray(input.receipts)||(!input.platform.length&&!input.receipts.length))throw Error('Isi pembayaran sebelumnya.');
  if(loan.ownerId==='self'&&input.receipts.length)throw Error('Hutang sendiri tidak memiliki pembayaran dari pemilik hutang.');
  const rows=installments(loan);let next=book;
  const platform=input.platform.map((number:number)=>({number,amount:rows.find(r=>r.number===number)?.platformRemaining??0}));
  for(const [side,allocations] of [['platform',platform],['borrower',input.receipts]] as const){
   if(allocations.length)next=loanAction(next,'loan_pay',id+'-'+side,{loanId:loan.id,side,date:input.date,historical:true,note:input.note,allocations},actor,now);
  }
  return {...next,revision:book.revision+1};
 }
 if(action==='loan_create'){
  object(input,['title','borrower','platform','principal','monthly','tenor','date','firstDue','dueDay','notes','ownerId','opening']);
  if(loans.length>=200||loans.some(l=>l.id===id))throw Error('Pinjaman sudah ada atau batas 200 pinjaman tercapai.');
  if(!Number.isInteger(input.tenor)||input.tenor<1||input.tenor>120)throw Error('Tenor 1–120 bulan.');
  if(!validDate(input.date)||input.date>today()||!validDate(input.firstDue)||input.firstDue<input.date||!validDate(dueDate(input.firstDue,input.tenor-1)))throw Error('Periksa tanggal pinjaman dan jatuh tempo pertama.');
  const dueDay=input.dueDay??Number(input.firstDue.slice(8));if(!Number.isInteger(dueDay)||dueDay<1||dueDay>31||dueDate(input.firstDue,0,dueDay)!==input.firstDue)throw Error('Tanggal jatuh tempo pertama tidak cocok dengan tanggal bulanan.');
  const monthly=amount(input.monthly);amount(monthly*input.tenor);
  const people=debtPeople(book);const person=input.ownerId&&input.ownerId!=='self'?people.find(p=>p.id===input.ownerId):undefined;if(input.ownerId&&input.ownerId!=='self'&&!person)throw Error('Pemilik hutang tidak ditemukan.');const borrower=input.ownerId==='self'?'Saya':person?.name??str(input.borrower,100);const owner=input.ownerId||people.find(p=>p.name.trim().toLowerCase()===borrower.trim().toLowerCase())?.id||id;
  const loan:Loan={id,title:str(input.title,100),borrower,ownerId:owner,platform:str(input.platform,100),principal:amount(input.principal),monthly,tenor:input.tenor,date:input.date,firstDue:input.firstDue,dueDay,notes:str(input.notes,1000,false),payments:[],...audit};
  const next={...book,revision:book.revision+1,loans:[...loans,loan]};
  if(input.opening!==undefined){object(input.opening,['date','platform','receipts','note']);return {...loanAction(next,'loan_opening',id+'-initial',{...input.opening,loanId:id},actor,now),revision:next.revision};}
  return next;
 }
 if(action==='loan_edit'||action==='loan_archive'||action==='loan_void'){
  const old=loans.find(l=>l.id===id);if(!old||isVoidedLoan(old))throw Error('Pinjaman aktif tidak ditemukan.');
  const {payments,history,...before}=old;let next:Loan;
  if(action!=='loan_edit'){object(input,['reason']);const reason=action==='loan_void'?str(input.reason,500):str(input.reason??'Dihapus melalui aplikasi versi lama.',500);next={...old,archived:true,voided:{at:now,by:actor,reason}};}
  else{
   object(input,['title','borrower','platform','principal','monthly','tenor','date','firstDue','dueDay','notes']);
   const temp=loanAction({revision:0,entries:[]},'loan_create',id,{...input,ownerId:old.ownerId==='self'?'self':''},actor,now).loans![0];
   const rows=installments(old),locked=rows.filter(r=>r.platformPaid>0||r.borrowerPaid>0);
   if(locked.some(r=>r.number>temp.tenor))throw Error('Tenor tidak boleh menghapus cicilan yang sudah dibayar.');
   if(old.payments.some(p=>!p.cancelled&&p.date<temp.date))throw Error('Tanggal pinjaman tidak boleh melewati pembayaran yang tercatat.');
   const schedule=installments(temp).map(r=>{const keep=locked.find(x=>x.number===r.number);return {number:r.number,amount:keep?.amount??r.amount,due:keep?.due??r.due};});
   if(schedule.some((r,i)=>r.due<temp.date||(i>0&&r.due<=schedule[i-1].due)))throw Error('Jadwal baru harus berurutan setelah tanggal pinjaman; cicilan dibayar tetap terkunci.');
   amount(schedule.reduce((n,r)=>n+r.amount,0));next={...old,...temp,ownerId:debtOwnerId(book,old),payments:old.payments,createdAt:old.createdAt,createdBy:old.createdBy,schedule};
  }
  next.history=[...(old.history??[]),{at:now,by:actor,action:action==='loan_edit'?action:'loan_void',before,...(next.voided?{reason:next.voided.reason}:{})}];
  return {...book,revision:book.revision+1,loans:loans.map(l=>l.id===id?next:{...l,ownerId:debtOwnerId(book,l)}),entries:book.entries.map(e=>{if(action!=='loan_edit'||e.debtPersonId||e.type!=='income'||e.category!=='Pembayaran utang')return e;const person=debtPeople(book).find(p=>p.name.trim().replace(/\s+/g,' ').toLowerCase()===e.party.trim().replace(/\s+/g,' ').toLowerCase());return person?{...e,debtPersonId:person.id,updatedAt:now,updatedBy:actor,history:[...(e.history??[]),{at:now,by:actor,action:'edit',before:entryFields(e)}]}:e;})};
 }
 object(input,action==='loan_pay'?['loanId','side','date','accountId','allocations','historical','note']:['loanId']);
 const loan=loans.find(l=>l.id===input.loanId);if(!loan)throw Error('Pinjaman tidak ditemukan.');if(isVoidedLoan(loan)&&action!=='loan_cancel_payment')throw Error('Catatan pinjaman telah dibatalkan.');
 if(action==='loan_cancel_payment'){
  const old=loan.payments.find(p=>p.id===id&&!p.cancelled);if(!old)throw Error('Pembayaran aktif tidak ditemukan.');
  if(isVoidedLoan(loan)&&(old.historical||!book.entries.some(e=>e.sourceLoanPaymentId===id&&!e.cancelled)))throw Error('Catatan lama pada pinjaman dibatalkan hanya tersedia sebagai jejak perubahan.');
  if(old.side==='borrower'&&!old.historical)throw Error('Batalkan penerimaan ini melalui menu Keuangan.');
  return {...book,revision:book.revision+1,loans:loans.map(l=>l.id===loan.id?{...l,payments:l.payments.map(p=>p.id===id?{...p,cancelled:true,cancelledAt:now,cancelledBy:actor}:p)}:l),entries:book.entries.map(e=>e.sourceLoanPaymentId===id?{...e,cancelled:true,updatedAt:now,updatedBy:actor,history:[...e.history,{at:now,by:actor,action:'cancel',before:entryFields(e)}]}:e)};
 }
 if(input.side==='borrower'&&(!input.historical||loan.ownerId==='self'))throw Error('Catat penerimaan pembayaran hutang di menu Keuangan.');
 if(action!=='loan_pay')throw Error('Tindakan pinjaman tidak valid.');
 if(loans.some(l=>l.payments.some(p=>p.id===id))||book.entries.some(e=>e.id===id))throw Error('Pembayaran sudah tercatat.');
 if(!['borrower','platform'].includes(input.side)||typeof input.historical!=='boolean'||!validDate(input.date)||input.date>today()||input.date<loan.date)throw Error('Periksa jenis dan tanggal pembayaran.');
 const rows=installments(loan),seen=new Set<number>();
 if(!Array.isArray(input.allocations)||!input.allocations.length||input.allocations.length>loan.tenor)throw Error('Pilih cicilan yang dibayar.');
 const allocations=input.allocations.map((a:any)=>{object(a,['number','amount']);const row=rows.find(r=>r.number===a.number);if(!row||seen.has(a.number))throw Error('Pilihan cicilan tidak valid.');seen.add(a.number);const value=amount(a.amount);if(value>(input.side==='borrower'?row.borrowerRemaining:row.platformRemaining))throw Error('Pembayaran melebihi sisa cicilan.');return {number:a.number,amount:value};});
 const total=amount(allocations.reduce((n:number,a:{amount:number})=>n+a.amount,0)),note=str(input.note,500,false);
 let entry:FinanceEntry|undefined;
 if(!input.historical){
  const account=requireAccount(book,input.accountId,input.date);if(!account.opening||input.date<account.opening.date)throw Error('Atur saldo awal rekening sebelum tanggal pembayaran, atau gunakan catatan pembayaran lama.');
  if(input.side==='platform'&&(accountBalance(book,account.id).current??0)<total)throw Error('Saldo rekening tidak cukup. Pembayaran belum dicatat.');
  if(book.entries.length>=5000)throw Error('Batas 5.000 transaksi tercapai.');
  entry={id,sourceLoanPaymentId:id,sourceLoanId:loan.id,type:input.side==='borrower'?'income':'expense',accountId:account.id,amount:total,date:input.date,category:input.side==='borrower'?'Pembayaran utang':'Cicilan',description:`${loan.title} · ${input.side==='borrower'?'Diterima dari '+loan.borrower:'Dibayar ke '+loan.platform} · cicilan ${allocations.map((a:{number:number})=>a.number).join(', ')}`,party:input.side==='borrower'?loan.borrower:loan.platform,method:'Pembayaran cicilan',...audit,updatedAt:now,updatedBy:actor,cancelled:false,history:[{at:now,by:actor,action:'create',before:null}]};
 }
 const payment:LoanPayment={id,side:input.side,date:input.date,amount:total,allocations,...(entry?{accountId:entry.accountId}:{}),historical:input.historical,note,...audit,cancelled:false};
 if(loan.payments.length>=1000)throw Error('Batas 1.000 catatan pembayaran per pinjaman.');
 return {...book,revision:book.revision+1,loans:loans.map(l=>l.id===loan.id?{...l,payments:[...l.payments,payment]}:l),entries:entry?[...book.entries,entry]:book.entries};
}
