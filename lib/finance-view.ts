import {today,validDate} from './jaga.ts';
import {runningBalance,moneyAccounts,accountBalance,type FinanceData} from './finance.ts';
import {payLaterTransactions,payLaterBalance} from './paylater.ts';
export function financeView(book:FinanceData,q:URLSearchParams){
 const from=q.get('from')||today(),to=q.get('to')||from,page=Number(q.get('page')||1),account=q.get('account')||'all',category=q.get('category')||'all',type=q.get('type')||'all';
 if(!validDate(from)||!validDate(to)||from>to||!Number.isSafeInteger(page)||page<1)throw Error('Filter transaksi tidak valid.');
 const rows=[...book.entries,...payLaterTransactions(book)].filter(e=>!e.cancelled&&(q.get('cash')!=='1'||!e.transferId&&!e.sourcePayLaterPurchaseId)&&(!q.get('id')||e.id===q.get('id'))&&e.date>=from&&e.date<=to&&(type==='all'||e.type===type)&&(category==='all'||e.category===category)&&(account==='all'||(e.accountId??'mandiri')===account)).sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));
 const pages=Math.max(1,Math.ceil(rows.length/10)),currentPage=Math.min(page,pages),cash=rows.filter(e=>!e.sourcePayLaterPurchaseId&&!e.transferId);
 return {page:currentPage,pages,total:rows.length,entries:rows.slice((currentPage-1)*10,currentPage*10),income:cash.filter(e=>e.type==='income').reduce((n,e)=>n+e.amount,0),expense:cash.filter(e=>e.type==='expense').reduce((n,e)=>n+e.amount,0),credit:rows.filter(e=>e.sourcePayLaterPurchaseId).reduce((n,e)=>n+e.amount,0),data:{revision:book.revision,entries:[],loans:book.loans,opening:book.opening,accounts:book.accounts,snapshotBalances:Object.fromEntries(moneyAccounts(book).map(a=>[a.id,accountBalance(book,a.id).current])),payLaterAccounts:book.payLaterAccounts?.map(a=>({...a,history:undefined,openingUsed:payLaterBalance(book,a.id).used}))}};
}
