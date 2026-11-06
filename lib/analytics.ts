import {validDate} from './jaga.ts';
import type {FinanceData,FinanceEntry} from './finance.ts';
export type AnalyticsFilter={from:string;to:string;account:string;category:string};
export type Preset='today'|'week'|'month'|'last7'|'last30'|'last90'|'lastMonth'|'quarter'|'sixMonths'|'year'|'custom';
type DailySpending={date:string;cash:number;credit:number;repayment:number;total:number};
const iso=(d:Date)=>d.toISOString().slice(0,10);
const day=(s:string)=>new Date(s+'T00:00:00Z');
const shift=(s:string,days:number)=>iso(new Date(+day(s)+days*86400000));
const monthStart=(s:string,offset=0)=>{const d=day(s);return iso(new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+offset,1)));};
const monthEnd=(s:string)=>{const d=day(s);return iso(new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)));};
export function presetRange(p:Preset,now:string){
 if(p==='today')return {from:now,to:now};
 if(p==='week'){const weekday=day(now).getUTCDay();return {from:shift(now,-((weekday+6)%7)),to:now};}
 if(p==='last7')return {from:shift(now,-6),to:now};
 if(p==='last30')return {from:shift(now,-29),to:now};
 if(p==='last90')return {from:shift(now,-89),to:now};
 if(p==='lastMonth'){const from=monthStart(now,-1);return {from,to:monthEnd(from)};}
 return {from:p==='quarter'?monthStart(now,-2):p==='sixMonths'?monthStart(now,-5):p==='year'?now.slice(0,4)+'-01-01':monthStart(now),to:now};
}
export function validateRange(f:AnalyticsFilter,now:string){if(!validDate(f.from)||!validDate(f.to)||f.from>f.to||f.to>now||(+day(f.to)-+day(f.from))/86400000>731)throw Error('Pilih rentang sampai hari ini, maksimal 732 hari.');}
export function previousRange(f:AnalyticsFilter,p:Preset){
 if(p==='month'){const from=monthStart(f.from,-1),last=monthEnd(from);return {from,to:from.slice(0,8)+String(Math.min(Number(f.to.slice(8)),Number(last.slice(8)))).padStart(2,'0')};}
 const length=Math.round((+day(f.to)-+day(f.from))/86400000)+1,to=shift(f.from,-1);return {from:shift(to,-(length-1)),to};
}
export function financeAnalytics(book:FinanceData,f:AnalyticsFilter,p:Preset,now:string){
 validateRange(f,now);
 const eligible=book.entries.filter(e=>!e.cancelled&&!e.transferId&&(f.account==='all'||(e.accountId??'mandiri')===f.account)&&(f.category==='all'||e.category===f.category));
 const between=(from:string,to:string)=>eligible.filter(e=>e.date>=from&&e.date<=to).sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));
 const entries=between(f.from,f.to),prior=previousRange(f,p),previous=between(prior.from,prior.to);
 const total=(rows:FinanceEntry[],type:string)=>rows.filter(e=>e.type===type).reduce((n,e)=>n+e.amount,0);
 const income=total(entries,'income'),expense=total(entries,'expense'),previousExpense=total(previous,'expense');
 const groups=(type:'income'|'expense')=>[...new Set(entries.filter(e=>e.type===type).map(e=>e.category))].map(name=>{const rows=entries.filter(e=>e.type===type&&e.category===name);return {name,total:rows.reduce((n,e)=>n+e.amount,0),entries:rows};}).sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name));
 const months:{month:string;income:number;expense:number;entries:FinanceEntry[]}[]=[];for(let m=monthStart(f.from);m<=f.to;m=monthStart(m,1)){const rows=entries.filter(e=>e.date.slice(0,7)===m.slice(0,7));months.push({month:m.slice(0,7),income:total(rows,'income'),expense:total(rows,'expense'),entries:rows});}
 const creditPurchases=(book.payLaterPurchases??[]).filter(x=>!x.cancelled&&x.date>=f.from&&x.date<=f.to&&f.account==='all'&&(f.category==='all'||x.category===f.category));
 const creditSpending=[...new Set(creditPurchases.map(x=>x.category))].map(category=>({category,total:creditPurchases.filter(x=>x.category===category).reduce((n,x)=>n+x.principal,0)}));
 const byDate=new Map<string,DailySpending>();
 for(let d=f.from;d<=f.to;d=shift(d,1))byDate.set(d,{date:d,cash:0,credit:0,repayment:0,total:0});
 for(const entry of entries){if(entry.type!=='expense')continue;const row=byDate.get(entry.date);if(!row)continue;if(entry.sourcePayLaterPaymentId)row.repayment+=entry.amount;else row.cash+=entry.amount;}
 for(const purchase of creditPurchases){const row=byDate.get(purchase.date);if(row)row.credit+=purchase.principal;}
 const daily=[...byDate.values()].map(row=>({...row,total:row.cash+row.credit}));
 return {creditPurchases,creditSpending,creditTotal:creditPurchases.reduce((n,x)=>n+x.principal,0),entries,income,expense,net:income-expense,salary:entries.filter(e=>e.type==='income'&&e.category==='Gaji').reduce((n,e)=>n+e.amount,0),sources:groups('income'),spending:groups('expense'),months,daily,dailyTotal:daily.reduce((n,row)=>n+row.total,0),prior,previousExpense,previousCount:previous.length,dailyExpense:expense/(Math.round((+day(f.to)-+day(f.from))/86400000)+1)};
}
