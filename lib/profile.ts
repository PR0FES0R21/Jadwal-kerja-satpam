export type ProfileFields={displayName:string;team:string;workplace:string;bio:string};
export type Profile=ProfileFields&{revision:number};
export const emptyProfile=():Profile=>({displayName:'',team:'',workplace:'',bio:'',revision:0});
export function profileFields(value:unknown):ProfileFields{
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Profil tidak valid.');
  const input=value as Record<string,unknown>,limits={displayName:80,team:60,workplace:100,bio:280};
  if(Object.keys(input).some(key=>!Object.hasOwn(limits,key)))throw Error('Kolom profil tidak dikenali.');
  const result={} as ProfileFields;
  for(const key of Object.keys(limits) as (keyof ProfileFields)[]){
    if(typeof input[key]!=='string')throw Error('Isi profil dengan teks.');
    const text=input[key].trim();
    if(text.length>limits[key]||(key==='bio'?/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/:/[\u0000-\u001F\u007F]/).test(text))throw Error('Isi profil terlalu panjang atau mengandung karakter tidak valid.');
    result[key]=text;
  }
  return result;
}
