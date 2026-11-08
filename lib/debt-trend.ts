import type {FinanceData} from './finance.ts';
import {installments,isVoidedLoan} from './loans.ts';
import {debtPeople,ownerId} from './debt.ts';

// Restate corrections instead of treating a typing correction as borrowing or repayment.
// These are platform obligations (total installments), independent of borrower receipts.
export function debtTrend(book:FinanceData,from:string,to:string,person='all'){
 const people=[{id:'self',name:'Saya'},...debtPeople(book)].filter(p=>(book.loans??[]).some(l=>!isVoidedLoan(l)&&ownerId(book,l)===p.id));
 if(person!=='all'&&!people.some(p=>p.id===person))throw Error('Pemilik hutang tidak ditemukan.');
 const events:{date:string;amount:number;label:string;loanId:string}[]=[];
 for(const loan of book.loans??[]){
  if(isVoidedLoan(loan)||(person!=='all'&&ownerId(book,loan)!==person))continue;
  events.push({date:loan.date,amount:installments(loan).reduce((n,r)=>n+r.amount,0),label:loan.title,loanId:loan.id});
  for(const payment of loan.payments){if(payment.cancelled||payment.side!=='platform')continue;
   events.push({date:payment.date,amount:-payment.amount,label:'Pembayaran · '+loan.title,loanId:loan.id});
  }
 }
 events.sort((a,b)=>a.date.localeCompare(b.date)||b.amount-a.amount||a.loanId.localeCompare(b.loanId));
 let balance=events.filter(e=>e.date<from).reduce((n,e)=>n+e.amount,0);
 const opening=balance,points:{date:string;balance:number;added:number;paid:number;activities:typeof events}[]=[{date:from,balance,added:0,paid:0,activities:[]}];
 for(const e of events.filter(e=>e.date>=from&&e.date<=to)){
  let point=points.at(-1)!;if(point.date!==e.date){point={date:e.date,balance,added:0,paid:0,activities:[]};points.push(point);}
  balance+=e.amount;point.balance=balance;point.added+=Math.max(0,e.amount);point.paid+=Math.max(0,-e.amount);point.activities.push(e);
 }
 if(points.at(-1)!.date!==to)points.push({date:to,balance,added:0,paid:0,activities:[]});
 const monthly:typeof points=[];
 for(let month=from.slice(0,7);month<=to.slice(0,7);){
  const [y,m]=month.split('-').map(Number),last=new Date(Date.UTC(y,m,0)).toISOString().slice(0,10),date=last<to?last:to;
  const monthEvents=events.filter(e=>e.date>=from&&e.date.slice(0,7)===month&&e.date<=date);
  monthly.push({date,balance:events.filter(e=>e.date<=date).reduce((n,e)=>n+e.amount,0),added:monthEvents.reduce((n,e)=>n+Math.max(0,e.amount),0),paid:monthEvents.reduce((n,e)=>n+Math.max(0,-e.amount),0),activities:monthEvents});
  month=new Date(Date.UTC(y,m,1)).toISOString().slice(0,7);
 }
 return {people,person,opening,closing:balance,points,monthly,added:points.reduce((n,p)=>n+p.added,0),paid:points.reduce((n,p)=>n+p.paid,0)};
}
