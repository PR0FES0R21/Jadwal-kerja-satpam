import type {FinanceEntry} from './finance.ts';

export type FinanceScope='all'|'cash'|'spending'|'repayments';
export function inFinanceScope(e:FinanceEntry,scope:FinanceScope){
 if(e.cancelled)return false;
 if(scope==='all')return true;
 if(e.transferId)return false;
 if(scope==='cash')return !e.sourcePayLaterPurchaseId;
 if(scope==='repayments')return e.type==='expense'&&!!e.sourcePayLaterPaymentId;
 return e.type==='expense'&&!e.sourcePayLaterPaymentId;
}
export function matchesFinanceFilter(e:Pick<FinanceEntry,'accountId'|'category'>,f:{account:string;category:string;type?:string}){
 return (f.account==='all'||(e.accountId??'mandiri')===f.account)&&(f.category==='all'||f.category.split(',').includes(e.category));
}
