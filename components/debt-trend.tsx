'use client';
import {useState} from 'react';
import type {debtTrend} from '@/lib/debt-trend';
const money=(n:number)=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n);
const date=(s:string)=>new Date(s+'T12:00:00+07:00').toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Jakarta'});
type Trend=ReturnType<typeof debtTrend>;
export function DebtTrend({trend,onPerson}:{trend:Trend;onPerson:(person:string)=>void}){
 const [mode,setMode]=useState('activity'),[selected,setSelected]=useState('');
 const rows=mode==='activity'?trend.points:trend.monthly,point=rows.find(p=>p.date===selected)??rows.at(-1);
 const width=Math.max(300,Math.min(1600,rows.length*42)),max=Math.max(1,trend.opening,...rows.map(p=>p.balance));
 const first=Date.parse(rows[0]?.date??''),last=Date.parse(rows.at(-1)?.date??''),x=(s:string)=>46+(last===first ? .5 : (Date.parse(s)-first)/(last-first))*(width-78),y=(n:number)=>162-n/max*130;
 return <section className="panel analytics-section debt-trend"><div className="section-heading"><h2>Trend sisa hutang</h2><select aria-label="Pemilik hutang" value={trend.person} onChange={e=>{setSelected('');onPerson(e.target.value);}}><option value="all">Semua orang</option>{trend.people.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div><p className="muted">Pinjaman ke platform · seluruh cicilan, termasuk biaya. Tidak mengikuti filter transaksi keuangan.</p>
 <div className="debt-trend-totals"><span>Awal<strong>{money(trend.opening)}</strong></span><span>Akhir<strong>{money(trend.closing)}</strong></span><span>Perubahan<strong>{money(trend.closing-trend.opening)}</strong></span></div>
 <div className="analytics-detail-tabs" role="group" aria-label="Tampilan trend">{[['activity','Per aktivitas'],['month','Akhir bulan']].map(([v,label])=><button type="button" className="secondary" aria-pressed={mode===v} key={v} onClick={()=>{setMode(v);setSelected('');}}>{label}</button>)}</div>
 <div className="debt-line-scroll" role="region" aria-label="Grafik sisa hutang; geser mendatar"><svg viewBox={`0 0 ${width} 206`} style={{width:rows.length<=8?'100%':width}} role="group" aria-label="Sisa kewajiban pinjaman menurut tanggal aktivitas">
 {[0,.5,1].map(r=><g key={r}><line x1="46" x2={width-32} y1={y(r*max)} y2={y(r*max)} stroke="var(--border)"/><text x="4" y={y(r*max)-5} fill="var(--muted-text)" fontSize="10">{new Intl.NumberFormat('id-ID',{notation:'compact',maximumFractionDigits:1}).format(r*max)}</text></g>)}
 <polyline points={rows.map(p=>`${x(p.date)},${y(p.balance)}`).join(' ')} fill="none" stroke="var(--primary)" strokeWidth="2.5"/>
 {rows.map((p,i)=><g key={p.date}><circle cx={x(p.date)} cy={y(p.balance)} r={point?.date===p.date?7:5} fill="var(--primary)" stroke="var(--surface)" strokeWidth="2" role="button" tabIndex={0} aria-label={`${date(p.date)}: ${money(p.balance)}. ${p.activities.length} aktivitas`} onClick={()=>setSelected(p.date)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelected(p.date);}}}><title>{date(p.date)} · {money(p.balance)}</title></circle>{(i===0||i===rows.length-1||rows.length<9)&&<text x={x(p.date)} y="190" textAnchor="middle" fontSize="10" fill="var(--muted-text)">{p.date.slice(8)+'/'+p.date.slice(5,7)}</text>}</g>)}
 </svg></div>
 {point&&<div className="debt-trend-point"><strong>{date(point.date)} · {money(point.balance)}</strong>{point.activities.length?<ul>{point.activities.map((a,i)=><li key={i}><span>{a.label}<small>{date(a.date)}</small></span><b className={a.amount>0?'negative':'positive'}>{a.amount>0?'+':'−'}{money(Math.abs(a.amount))}</b></li>)}</ul>:<p className="muted">Saldo dibawa dari aktivitas sebelumnya.</p>}</div>}
 <details className="analytics-notes"><summary>Dasar perhitungan</summary><p>Pinjaman baru menambah total cicilan pada tanggal pinjaman. Pembayaran ke platform mengurangi sisa pada tanggal pembayaran, termasuk pembayaran lama. Penerimaan uang dari pemilik hutang tidak mengubah grafik ini. Koreksi dan pembatalan memperbarui ulang riwayat; bukan dianggap pinjaman baru. Grafik mengikuti tanggal yang tercatat, tidak menebak pembayaran yang belum dicatat. PayLater dicatat terpisah.</p></details>
 </section>;
}
