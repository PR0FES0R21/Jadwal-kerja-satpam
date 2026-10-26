'use client';
import {createContext,useContext,useEffect,useState} from 'react';
import {Sun,Moon,Monitor} from 'lucide-react';
type Mode='light'|'dark'|'system';
const ThemeContext=createContext<{mode:Mode;setMode:(mode:Mode)=>void}>({mode:'system',setMode:()=>{}});
export function ThemeProvider({children}:{children:React.ReactNode}){
 const [mode,setMode]=useState<Mode>(()=>{if(typeof window==='undefined')return 'system';try{const m=localStorage.getItem('jaga-theme');return m==='light'||m==='dark'?m:'system';}catch{return 'system';}});
 useEffect(()=>{const system=matchMedia('(prefers-color-scheme: dark)');const apply=()=>{const dark=mode==='dark'||(mode==='system'&&system.matches);document.documentElement.classList.toggle('dark',dark);document.documentElement.style.colorScheme=dark?'dark':'light';document.querySelector('meta[name="theme-color"]')?.setAttribute('content',dark?'#101817':'#f5f7f6');};apply();system.addEventListener('change',apply);return()=>system.removeEventListener('change',apply);},[mode]);
 useEffect(()=>{const sync=(e:StorageEvent)=>{if(e.key==='jaga-theme')setMode(e.newValue==='light'||e.newValue==='dark'?e.newValue:'system');};window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync);},[]);
 function change(value:Mode){setMode(value);try{localStorage.setItem('jaga-theme',value);}catch{}}
 return <ThemeContext.Provider value={{mode,setMode:change}}>{children}</ThemeContext.Provider>;
}
export function ThemePicker(){const {mode,setMode}=useContext(ThemeContext);return <div className="theme-picker"><span>Tampilan</span><div className="segmented" role="group" aria-label="Tema aplikasi">{([['light','Terang',Sun],['dark','Gelap',Moon],['system','Sistem',Monitor]] as const).map(([value,label,Icon])=><button key={value} type="button" aria-pressed={mode===value} onClick={()=>setMode(value)}><Icon size={17}/>{label}</button>)}</div></div>;}
