'use client';
import {ChevronLeft,ChevronRight,CreditCard} from 'lucide-react';
import type {FinanceEntry} from '@/lib/finance';
import {TransactionIcon} from './transaction-icon';

const money=new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0});
const activityDate=new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Jakarta'});
const recordedTime=new Intl.DateTimeFormat('id-ID',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Jakarta'});

export function TransactionRow({entry,accountName,showDate=false,onOpen}:{entry:FinanceEntry;accountName:string;showDate?:boolean;onOpen:()=>void}){
 const tone=entry.transferId?'transport':entry.type==='income'?'income':entry.category==='Transportasi'?'transport':['Makan','Minum'].includes(entry.category)?'food':entry.category==='Belanja'?'shopping':'expense';
 return <button type="button" className="transaction-row" onClick={onOpen}>
  <span className={'transaction-symbol '+tone}><TransactionIcon entry={entry}/></span>
  <span className="transaction-copy"><strong>{entry.description}</strong><small>{showDate&&<time dateTime={entry.date}>{activityDate.format(new Date(entry.date+'T12:00:00+07:00'))}</time>}<span className="transaction-source">{entry.sourcePayLaterPurchaseId&&<CreditCard size={12} aria-label="PayLater"/>}<span>{entry.transferId?'Transfer · ':''}{accountName}</span></span></small></span>
  <span className="transaction-value"><b className={entry.type==='income'?'positive':'negative'}>{entry.type==='income'?'+':'−'}{money.format(entry.amount)}</b>{!showDate&&<time dateTime={entry.createdAt}>{recordedTime.format(new Date(entry.createdAt))}</time>}</span>
 </button>;
}

export function TransactionPaging({page,pages,total,loading=false,label,onPage}:{page:number;pages:number;total:number;loading?:boolean;label:string;onPage:(page:number)=>void}){
 if(pages<=1)return null;
 return <nav className="paging transaction-paging" aria-label={label}><button type="button" className="icon-button" aria-label="Halaman sebelumnya" disabled={loading||page<=1} onClick={()=>onPage(page-1)}><ChevronLeft size={19}/></button><span aria-live="polite">{page} / {pages}<small>{total} transaksi</small></span><button type="button" className="icon-button" aria-label="Halaman berikutnya" disabled={loading||page>=pages} onClick={()=>onPage(page+1)}><ChevronRight size={19}/></button></nav>;
}
