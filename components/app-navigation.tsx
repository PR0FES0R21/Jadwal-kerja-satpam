'use client';

import {CalendarDays,ChevronRight,Download,History,LogOut,NotebookTabs,Pencil,Settings,UserRound,Wallet} from 'lucide-react';
import type {Profile} from '@/lib/profile';
import {toast} from 'sonner';
import {ProfileAvatar} from '@/components/profile';
import {ThemePicker} from '@/components/theme';

const mainItems=[
  {id:'finance',label:'Keuangan',icon:Wallet,screens:['finance','paylater','analytics']},
  {id:'loans',label:'Hutang',icon:NotebookTabs,screens:['loans']},
  {id:'calendar',label:'Kalender',icon:CalendarDays,screens:['calendar','swaps','overtime']},
  {id:'history',label:'Riwayat',icon:History,screens:['history','reports']},
  {id:'profile',label:'Profil',icon:UserRound,screens:['profile','profile-edit','settings']},
];

export function BottomNavigation({active,onNavigate,disabled=false}:{active:string;onNavigate:(screen:string)=>void;disabled?:boolean}){
  return <nav className="bottom-nav" aria-label="Navigasi utama">
    {mainItems.map(({id,label,icon:Icon,screens})=><button
      key={id}
      type="button"
      className={id==='calendar'?'nav-home':undefined}
      aria-current={screens.includes(active)?'page':undefined}
      onClick={()=>onNavigate(id)}
      disabled={disabled}
    >
      <span className="nav-symbol"><Icon size={22} aria-hidden="true"/></span>
      <span className="nav-label">{label}</span>
    </button>)}
  </nav>;
}

export function ProfileHome({username,profile,onNavigate,onLogout,disabled=false}:{username?:string;profile?:Profile;onNavigate:(screen:string)=>void;onLogout?:()=>Promise<void>;disabled?:boolean}){
  const name=profile?.displayName||username||'Catatan lokal';
  return <div className="profile-home">
    <div className="screen-title"><h1>Profil</h1></div>
    <section className="panel profile-summary">
      <ProfileAvatar username={username??'local'} name={name} large/>
      <div className="profile-summary-copy">
        <h2>{name}</h2>
        <p>{profile?.team||'Regu belum diisi'}</p>
        {username&&<small>@{username}</small>}
      </div>
      {username&&<button className="icon-button" aria-label="Edit profil" disabled={disabled} onClick={()=>onNavigate('profile-edit')}><Pencil size={18}/></button>}
    </section>
    <section className="panel profile-appearance" aria-label="Tampilan aplikasi"><ThemePicker/></section>
    <section className="panel profile-options" aria-label="Pengaturan akun">
      <button className="profile-menu-row" disabled={disabled} onClick={()=>onNavigate('settings')}>
        <span className="profile-menu-icon"><Settings size={20}/></span><span>Pengaturan & cadangan</span><ChevronRight size={18}/>
      </button>
      <button className="profile-menu-row" onClick={()=>window.dispatchEvent(new CustomEvent('jaga-install'))}>
        <span className="profile-menu-icon"><Download size={20}/></span><span>Pasang aplikasi</span><ChevronRight size={18}/>
      </button>
      {onLogout&&<button className="profile-menu-row logout" disabled={disabled} onClick={()=>void onLogout().catch(e=>toast.error(e instanceof Error?e.message:'Tidak bisa keluar. Coba lagi.'))}>
        <span className="profile-menu-icon"><LogOut size={20}/></span><span>Keluar</span><ChevronRight size={18}/>
      </button>}
    </section>
  </div>;
}
