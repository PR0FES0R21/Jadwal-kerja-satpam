const database='jaga-profile-photos-v1';
async function access<T>(mode:IDBTransactionMode,action:(store:IDBObjectStore)=>IDBRequest):Promise<T>{
  return new Promise((resolve,reject)=>{
    const open=indexedDB.open(database,1);
    open.onupgradeneeded=()=>open.result.createObjectStore('photos');
    open.onerror=()=>reject(Error('Penyimpanan foto tidak tersedia di browser ini.'));
    open.onsuccess=()=>{const db=open.result,tx=db.transaction('photos',mode),request=action(tx.objectStore('photos'));
      tx.oncomplete=()=>{db.close();resolve(request.result as T);};
      tx.onerror=tx.onabort=()=>{db.close();reject(Error('Foto belum tersimpan. Periksa ruang penyimpanan perangkat.'));};
    };
  });
}
export async function readPhoto(username:string):Promise<Blob|null>{try{const value=await access<Blob>('readonly',store=>store.get(username));return value instanceof Blob?value:null;}catch{return null;}}
export async function storePhoto(username:string,photo:Blob|null){await access('readwrite',store=>photo?store.put(photo,username):store.delete(username));window.dispatchEvent(new CustomEvent('jaga-photo',{detail:username}));}
export async function preparePhoto(file:File):Promise<Blob>{
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Pilih foto JPG, PNG, atau WebP.');
  if(file.size>10*1024*1024)throw Error('Ukuran foto maksimal 10 MB.');
  let bitmap:ImageBitmap;try{bitmap=await createImageBitmap(file);}catch{throw Error('Foto tidak dapat dibaca. Pilih berkas gambar lain.');}
  try{
    if(!bitmap.width||!bitmap.height||bitmap.width*bitmap.height>36000000)throw Error('Dimensi foto terlalu besar. Pilih foto yang lebih kecil.');
    const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
    const context=canvas.getContext('2d');if(!context)throw Error('Browser belum bisa memproses foto.');
    const size=Math.min(bitmap.width,bitmap.height);context.drawImage(bitmap,(bitmap.width-size)/2,(bitmap.height-size)/2,size,size,0,0,512,512);
    const result=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/webp',0.85));
    if(!result||result.size>1024*1024)throw Error('Foto belum bisa disimpan. Pilih foto yang lebih kecil.');
    return result;
  }finally{bitmap.close();}
}
