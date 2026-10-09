'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {Camera,Trash2,UserRound,Save,RefreshCw} from 'lucide-react';
import {toast} from 'sonner';
import {cloud,CloudError} from '@/lib/cloud';
import {Profile,ProfileFields,emptyProfile,profileFields} from '@/lib/profile';
import {preparePhoto,readPhoto,storePhoto} from '@/lib/profile-photo';
import {updateProfileSnapshot} from '@/lib/offline';
function usePhoto(username:string){
  const [url,setUrl]=useState<string|null>(null);
  useEffect(()=>{let alive=true,current:string|null=null;
    async function refresh(){const photo=await readPhoto(username);if(!alive)return;if(current)URL.revokeObjectURL(current);current=photo?URL.createObjectURL(photo):null;setUrl(current);}
    const changed=(event:Event)=>{if((event as CustomEvent).detail===username)void refresh();};
    void refresh();window.addEventListener('jaga-photo',changed);
    return()=>{alive=false;if(current)URL.revokeObjectURL(current);window.removeEventListener('jaga-photo',changed);};
  },[username]);
  return url;
}
export function ProfileAvatar({username,name,large=false}:{username:string;name:string;large?:boolean}){
  const photo=usePhoto(username);
  const initials=name.trim().split(/\s+/).slice(0,2).map(part=>Array.from(part)[0]??'').join('').toUpperCase()||username.slice(0,2).toUpperCase();
  return <span className={'profile-avatar'+(large?' large':'')}>{photo?<img src={photo} alt={'Foto profil '+name}/>:<span aria-hidden="true">{initials}</span>}</span>;
}
function fields(profile:Profile):ProfileFields{return {displayName:profile.displayName,team:profile.team,workplace:profile.workplace,bio:profile.bio};}
export function ProfilePanel({username,initialProfile,readOnly=false,blocked=false,onChange,onWorking}:{username:string;initialProfile?:Profile;readOnly?:boolean;blocked?:boolean;onChange?:(profile:Profile)=>void;onWorking?:(working:boolean)=>void}){
  const profile=useMemo(()=>initialProfile??emptyProfile(),[initialProfile]);
  const [draft,setDraft]=useState<ProfileFields>(()=>fields(profile)),[working,setWorking]=useState(false),[photoWorking,setPhotoWorking]=useState(false),[error,setError]=useState(''),[photoError,setPhotoError]=useState(''),[conflict,setConflict]=useState(false);
  const input=useRef<HTMLInputElement>(null),photo=usePhoto(username);
  const dirty=JSON.stringify(draft)!==JSON.stringify(fields(profile)),busy=working||photoWorking;
  useEffect(()=>{setDraft(fields(profile));},[profile]);
  useEffect(()=>{onWorking?.(busy);return()=>onWorking?.(false);},[busy,onWorking]);
  useEffect(()=>{window.dispatchEvent(new CustomEvent('jaga-editing',{detail:{source:'profile',blocked:busy||dirty}}));return()=>{window.dispatchEvent(new CustomEvent('jaga-editing',{detail:{source:'profile',blocked:false}}));};},[busy,dirty]);
  async function save(){if(readOnly||blocked||busy)return;setWorking(true);setError('');try{
    const value=profileFields(draft);const result=await cloud<{profile:Profile}>('profile','PUT',{profile:value,expectedRevision:profile.revision});
    await updateProfileSnapshot(username,result.profile);onChange?.(result.profile);setDraft(fields(result.profile));setConflict(false);toast.success('Profil tersimpan');
  }catch(e){setError((e as Error).message);setConflict(e instanceof CloudError&&e.status===409);}finally{setWorking(false);}}
  async function changePhoto(file?:File){if(!file||blocked||busy)return;setPhotoWorking(true);setPhotoError('');try{await storePhoto(username,await preparePhoto(file));toast.success('Foto tersimpan di perangkat ini');}catch(e){setPhotoError((e as Error).message);}finally{setPhotoWorking(false);}}
  return <div className="profile-layout"><section className="panel profile-card"><div className="profile-identity"><ProfileAvatar username={username} name={profile.displayName||username} large/><div><p className="eyebrow">PROFIL SAYA</p><h2>{profile.displayName||username}</h2><p className="muted">@{username}</p>{profile.team&&<span className="profile-team">{profile.team}</span>}</div></div><p className="profile-place">{profile.workplace||'Tempat kerja belum diisi'}</p>{profile.bio&&<p className="profile-bio">{profile.bio}</p>}<div className="profile-photo-actions"><button className="secondary" disabled={busy||blocked} onClick={()=>input.current?.click()}><Camera size={17}/>{photo?'Ganti foto':'Tambah foto'}</button>{photo&&<button className="text-button" disabled={busy||blocked} onClick={async()=>{setPhotoWorking(true);setPhotoError('');try{await storePhoto(username,null);toast.success('Foto lokal dihapus');}catch(e){setPhotoError((e as Error).message);}finally{setPhotoWorking(false);}}}><Trash2 size={16}/>Hapus foto</button>}<input ref={input} aria-label="Pilih foto profil" type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e=>{void changePhoto(e.target.files?.[0]);e.target.value='';}}/></div>{photoWorking&&<p role="status" className="muted">Menyimpan foto di perangkat…</p>}{photoError&&<p className="error" role="alert">{photoError}</p>}<small>Foto hanya tersimpan di browser perangkat ini, termasuk saat offline. JPG, PNG, atau WebP, maksimal 10 MB. Foto dipotong persegi dari bagian tengah. Jika data browser dihapus atau berganti perangkat, pilih foto kembali.</small></section><section className="panel profile-editor"><h2><UserRound size={21}/>Edit profil</h2><p className="muted">Informasi ini tersimpan pada akun dan ikut saat lo pindah perangkat.</p>{readOnly&&<p className="profile-offline">Profil terakhir dapat dilihat saat offline. Sambungkan internet untuk mengubah informasi; foto tetap bisa diganti di perangkat ini.</p>}<form className="event-form" onSubmit={e=>{e.preventDefault();void save();}}><label>Username<input value={username} readOnly/><small>Dipakai untuk login.</small></label><label>Nama tampilan<input maxLength={80} value={draft.displayName} disabled={readOnly||busy||blocked} onChange={e=>setDraft({...draft,displayName:e.target.value})} placeholder="Nama yang ingin ditampilkan" autoComplete="name"/></label><div className="form-row"><label>Regu<input maxLength={60} value={draft.team} disabled={readOnly||busy||blocked} onChange={e=>setDraft({...draft,team:e.target.value})} placeholder="Contoh: Regu A"/></label><label>Tempat kerja<input maxLength={100} value={draft.workplace} disabled={readOnly||busy||blocked} onChange={e=>setDraft({...draft,workplace:e.target.value})} placeholder="Nama lokasi atau perusahaan" autoComplete="organization"/></label></div><label>Bio singkat<textarea maxLength={280} value={draft.bio} disabled={readOnly||busy||blocked} onChange={e=>setDraft({...draft,bio:e.target.value})} placeholder="Sedikit cerita tentang lo…"/><small>{draft.bio.length}/280 karakter</small></label>{error&&<p className="error" role="alert">{error}</p>}{conflict&&<div className="profile-conflict"><small>Isian belum disimpan. Memuat profil terbaru akan mengganti isian di formulir ini.</small><button className="secondary" type="button" disabled={busy||blocked||readOnly} onClick={async()=>{setWorking(true);try{const result=await cloud<{profile:Profile}>('profile');await updateProfileSnapshot(username,result.profile);onChange?.(result.profile);setConflict(false);setError('');}catch(e){setError((e as Error).message);}finally{setWorking(false);}}}><RefreshCw size={16}/>Muat profil terbaru</button></div>}<div className="button-row"><button className="primary" type="submit" disabled={readOnly||busy||blocked||!dirty}><Save size={17}/>{working?'Menyimpan…':'Simpan profil'}</button>{dirty&&<button className="secondary" type="button" disabled={busy||blocked} onClick={()=>{setDraft(fields(profile));setError('');setConflict(false);}}>Batalkan perubahan</button>}</div></form></section></div>;
}
