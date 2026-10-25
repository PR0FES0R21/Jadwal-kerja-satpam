import {validDate,today} from './jaga.ts';
export const categories={income:['Gaji','Pembayaran utang','Pemberian','Bonus','Lainnya'],expense:['Makan','Minum','Belanja','Kos','Transportasi','Cicilan','Lainnya']};
export type FinanceFields={type:'income'|'expense';date:string;amount:number;category:string;description:string;party:string;method:string};
export type FinanceEntry=FinanceFields&{id:string;createdAt:string;createdBy:string;updatedAt:string;updatedBy:string;cancelled:boolean;history:{at:string;by:string;action:string;before:FinanceFields|null}[]};
export type FinanceData={revision:number;entries:FinanceEntry[]};
export function financeFields(input:unknown):FinanceFields{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Transaksi tidak valid.');
 const v=input as Record<string,unknown>;
 if(Object.keys(v).some(k=>!['type','date','amount','category','description','party','method'].includes(k)))throw Error('Kolom transaksi tidak valid.');
 if(v.type!=='income'&&v.type!=='expense')throw Error('Pilih jenis transaksi.');
 if(typeof v.date!=='string'||!validDate(v.date)||v.date>today())throw Error('Pilih tanggal aktivitas yang valid, maksimal hari ini (WIB).');
 if(!Number.isSafeInteger(v.amount)||(v.amount as number)<=0||(v.amount as number)>1_000_000_000_000)throw Error('Nominal harus rupiah bulat, lebih dari nol, maksimal 1 triliun.');
 for(const [key,max] of [['category',60],['description',500],['party',100],['method',60]] as const)if(typeof v[key]!=='string'||(v[key] as string).length>max||/[\u0000-\u001f]/.test(v[key] as string))throw Error('Keterangan transaksi tidak valid.');
 if(!categories[v.type].includes(v.category as string)||!(v.description as string).trim())throw Error('Isi kategori dan keterangan transaksi.');
 return {type:v.type,date:v.date,amount:v.amount as number,category:v.category as string,description:(v.description as string).trim(),party:(v.party as string).trim(),method:(v.method as string).trim()};
}
