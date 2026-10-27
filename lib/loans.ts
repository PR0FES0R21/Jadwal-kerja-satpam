import {debtPeople} from './debt.ts';
import {today,validDate} from './jaga.ts';
import {accountBalance,requireAccount,entryFields,type FinanceData,type FinanceEntry} from './finance.ts';
export type LoanSide='borrower'|'platform';
export type LoanPayment={id:string;side:LoanSide;date:string;amount:number;allocations:{number:number;amount:number}[];accountId?:string;historical:boolean;note:string;createdAt:string;createdBy:string;cancelled:boolean;cancelledAt?:string;cancelledBy?:string};
export type Loan={id:string;title:string;borrower:string;ownerId?:string;platform:string;principal:number;monthly:number;tenor:number;date:string;firstDue:string;dueDay?:number;notes:string;createdAt:string;createdBy:string;payments:LoanPayment[]};
export function dueDate(first:string,offset:number,anchor?:number){const [y,m,d]=first.split('-').map(Number);const last=new Date(Date.UTC(y,m+offset,0)).getUTCDate();return new Date(Date.UTC(y,m-1+offset,Math.min(anchor??d,last))).toISOString().slice(0,10);}
export function installments(loan:Loan){return Array.from({length:loan.tenor},(_,i)=>{const number=i+1,paid=(side:LoanSide)=>loan.payments.filter(p=>!p.cancelled&&p.side===side).reduce((sum,p)=>sum+p.allocations.filter(a=>a.number===number).reduce((n,a)=>n+a.amount,0),0);const borrowerPaid=paid('borrower'),platformPaid=paid('platform');return {number,due:dueDate(loan.firstDue,i,loan.dueDay),amount:loan.monthly,borrowerPaid,platformPaid,borrowerRemaining:loan.monthly-borrowerPaid,platformRemaining:loan.monthly-platformPaid};});}
export function loanSummary(loan:Loan,at=today()){const rows=installments(loan);return {borrower:rows.reduce((n,r)=>n+r.borrowerRemaining,0),platform:rows.reduce((n,r)=>n+r.platformRemaining,0),advanced:rows.reduce((n,r)=>n+Math.max(0,r.platformPaid-r.borrowerPaid),0),due:rows.filter(r=>r.due.slice(0,7)===at.slice(0,7)).reduce((n,r)=>n+r.platformRemaining,0),overdue:rows.filter(r=>r.due<at).reduce((n,r)=>n+r.platformRemaining,0)};}
function object(v:any,keys:string[]){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!keys.includes(k)))throw Error('Kolom pinjaman tidak valid.');}
function str(v:any,max:number,required=true){if(typeof v!=='string'||v.length>max||/[\u0000-\u001f]/.test(v)||(required&&!v.trim()))throw Error('Isi nama dan keterangan dengan benar.');return v.trim();}
function amount(v:any){if(!Number.isSafeInteger(v)||v<=0||v>1e12)throw Error('Nominal harus rupiah bulat, lebih dari nol, maksimal 1 triliun.');return v as number;}
export function loanAction(book:FinanceData,action:string,id:string,input:any,actor:string,now:string):FinanceData{
 const loans=book.loans??[],audit={createdAt:now,createdBy:actor};
 if(action==='loan_create'){
  object(input,['title','borrower','platform','principal','monthly','tenor','date','firstDue','dueDay','notes','ownerId']);
  if(loans.length>=200||loans.some(l=>l.id===id))throw Error('Pinjaman sudah ada atau batas 200 pinjaman tercapai.');
  if(!Number.isInteger(input.tenor)||input.tenor<1||input.tenor>120)throw Error('Tenor 1–120 bulan.');
  if(!validDate(input.date)||input.date>today()||!validDate(input.firstDue)||input.firstDue<input.date||!validDate(dueDate(input.firstDue,input.tenor-1)))throw Error('Periksa tanggal pinjaman dan jatuh tempo pertama.');
  const dueDay=input.dueDay??Number(input.firstDue.slice(8));if(!Number.isInteger(dueDay)||dueDay<1||dueDay>31||dueDate(input.firstDue,0,dueDay)!==input.firstDue)throw Error('Tanggal jatuh tempo pertama tidak cocok dengan tanggal bulanan.');
  const monthly=amount(input.monthly);amount(monthly*input.tenor);
  const people=debtPeople(book);const person=input.ownerId&&input.ownerId!=='self'?people.find(p=>p.id===input.ownerId):undefined;if(input.ownerId&&input.ownerId!=='self'&&!person)throw Error('Pemilik hutang tidak ditemukan.');const borrower=input.ownerId==='self'?'Saya':person?.name??str(input.borrower,100);const owner=input.ownerId||people.find(p=>p.name.trim().toLowerCase()===borrower.trim().toLowerCase())?.id||id;
  const loan:Loan={id,title:str(input.title,100),borrower,ownerId:owner,platform:str(input.platform,100),principal:amount(input.principal),monthly,tenor:input.tenor,date:input.date,firstDue:input.firstDue,dueDay,notes:str(input.notes,1000,false),payments:[],...audit};
  return {...book,revision:book.revision+1,loans:[...loans,loan]};
 }
 object(input,action==='loan_pay'?['loanId','side','date','accountId','allocations','historical','note']:['loanId']);
 const loan=loans.find(l=>l.id===input.loanId);if(!loan)throw Error('Pinjaman tidak ditemukan.');
 if(action==='loan_cancel_payment'){
  const old=loan.payments.find(p=>p.id===id&&!p.cancelled);if(!old)throw Error('Pembayaran aktif tidak ditemukan.');
  if(old.side==='borrower'&&!old.historical)throw Error('Batalkan penerimaan ini melalui menu Keuangan.');
  return {...book,revision:book.revision+1,loans:loans.map(l=>l.id===loan.id?{...l,payments:l.payments.map(p=>p.id===id?{...p,cancelled:true,cancelledAt:now,cancelledBy:actor}:p)}:l),entries:book.entries.map(e=>e.sourceLoanPaymentId===id?{...e,cancelled:true,updatedAt:now,updatedBy:actor,history:[...e.history,{at:now,by:actor,action:'cancel',before:entryFields(e)}]}:e)};
 }
 if(input.side==='borrower')throw Error('Catat penerimaan pembayaran hutang di menu Keuangan.');
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
