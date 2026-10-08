'use client';
import {useEffect,useRef,useState} from 'react';
import {Download,RefreshCw,WifiOff} from 'lucide-react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
type InstallEvent=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};
export function PwaControls(){
  const [installed,setInstalled]=useState(false),[prompt,setPrompt]=useState<InstallEvent|null>(null),[help,setHelp]=useState(false),[waiting,setWaiting]=useState<ServiceWorker|null>(null),[offline,setOffline]=useState(false),[blocked,setBlocked]=useState(false);
  const requested=useRef(false);
  useEffect(()=>{
    const display=matchMedia('(display-mode: standalone)');
    const sync=()=>{setInstalled(display.matches||!!(navigator as Navigator&{standalone?:boolean}).standalone);setOffline(!navigator.onLine);};sync();
    const install=(event:Event)=>{event.preventDefault();setPrompt(event as InstallEvent);};
    const done=()=>{setInstalled(true);setPrompt(null);setHelp(false);};
    const editing=new Map<string,boolean>();
    const edit=(event:Event)=>{const detail=(event as CustomEvent<{source:string;blocked:boolean}>).detail;editing.set(detail.source,detail.blocked);setBlocked([...editing.values()].some(Boolean));};
    let alive=true;
    const change=()=>{if(requested.current)location.reload();};
    window.addEventListener('beforeinstallprompt',install);window.addEventListener('appinstalled',done);window.addEventListener('online',sync);window.addEventListener('offline',sync);window.addEventListener('jaga-editing',edit);display.addEventListener('change',sync);
    if('serviceWorker'in navigator){
      navigator.serviceWorker.addEventListener('controllerchange',change);
      navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).then(registration=>{
        if(!alive)return;if(registration.waiting)setWaiting(registration.waiting);
        registration.addEventListener('updatefound',()=>{const worker=registration.installing;worker?.addEventListener('statechange',()=>{if(alive&&worker.state==='installed'&&navigator.serviceWorker.controller)setWaiting(worker);});});
        void registration.update().catch(()=>{});
      }).catch(()=>{});
    }
    return()=>{alive=false;window.removeEventListener('beforeinstallprompt',install);window.removeEventListener('appinstalled',done);window.removeEventListener('online',sync);window.removeEventListener('offline',sync);window.removeEventListener('jaga-editing',edit);display.removeEventListener('change',sync);navigator.serviceWorker?.removeEventListener('controllerchange',change);};
  },[]);
  async function install(){if(!prompt){setHelp(true);return;}try{await prompt.prompt();await prompt.userChoice;}finally{setPrompt(null);}}
  return <><div className="pwa-controls" aria-label="Aplikasi Jaga">{offline&&<span className="pwa-offline" role="status"><WifiOff size={15}/>Offline</span>}{waiting&&<button className="secondary" disabled={blocked} title={blocked?'Simpan dan tutup formulir dahulu':'Muat ulang dengan versi terbaru'} onClick={()=>{requested.current=true;waiting.postMessage({type:'SKIP_WAITING'});}}><RefreshCw size={16}/>Perbarui aplikasi</button>}{!installed&&<button className="primary" onClick={install}><Download size={16}/>Pasang Jaga</button>}</div><Dialog open={help} onOpenChange={setHelp}><DialogContent className="install-dialog"><DialogTitle>Pasang Jaga di perangkat</DialogTitle><DialogDescription>Buka dari layar utama seperti aplikasi. Login sekali saat online untuk menyimpan salinan catatan terakhir di perangkat.</DialogDescription><p><strong>Android · Chrome</strong><br/>Buka menu ⋮, pilih <strong>Instal aplikasi</strong> atau <strong>Tambahkan ke layar utama</strong>.</p><p><strong>iPhone · Safari</strong><br/>Ketuk Bagikan, lalu <strong>Tambahkan ke Layar Utama</strong>.</p><small>Saat offline, catatan terakhir dapat dibaca dan diunduh. Sambungkan internet untuk mengubah catatan.</small><button className="primary" onClick={()=>setHelp(false)}>Mengerti</button></DialogContent></Dialog></>;
}
