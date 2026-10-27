import type {FinanceData,FinanceFields} from './finance.ts';
import type {Loan} from './loans.ts';
const key=(s:string)=>s.trim().replace(/\s+/g,' ').toLocaleLowerCase('id-ID');
export function debtPeople(book:FinanceData){const people:{id:string;name:string}[]=[];for(const l of book.loans??[]){if(l.ownerId==='self')continue;const id=l.ownerId??people.find(p=>key(p.name)===key(l.borrower))?.id??l.id;if(!people.some(p=>p.id===id))people.push({id,name:l.borrower});}return people;}
export function ownerId(book:FinanceData,loan:Loan){return loan.ownerId??debtPeople(book).find(p=>key(p.name)===key(loan.borrower))?.id??loan.id;}
export function receiptFields(book:FinanceData,fields:FinanceFields){if(!fields.debtPersonId)return fields;const p=debtPeople(book).find(p=>p.id===fields.debtPersonId);if(!p||fields.type!=='income'||fields.category!=='Pembayaran utang')throw Error('Pilih pembayar hutang yang valid.');return {...fields,party:p.name};}
export function personDebt(book:FinanceData,id:string){const person=debtPeople(book).find(p=>p.id===id),loans=(book.loans??[]).filter(l=>ownerId(book,l)===id);const total=loans.reduce((s,l)=>s+l.monthly*l.tenor,0);
 const receipts=book.entries.filter(e=>!e.cancelled&&!e.transferId&&e.type==='income'&&e.category==='Pembayaran utang'&&(e.debtPersonId?e.debtPersonId===id:person&&key(e.party)===key(person.name)));
 // Legacy receipts with cash entries are counted only through finance. Historical-only receipts remain auditable.
 const historical=loans.flatMap(l=>l.payments).filter(p=>p.side==='borrower'&&p.historical&&!p.cancelled&&!book.entries.some(e=>e.sourceLoanPaymentId===p.id)).reduce((s,p)=>s+p.amount,0);
 const received=receipts.reduce((s,e)=>s+e.amount,0)+historical;return {total,received,remaining:Math.max(0,total-received),credit:Math.max(0,received-total),receipts,historical};}
