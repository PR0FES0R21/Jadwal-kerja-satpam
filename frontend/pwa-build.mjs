import {readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
// Every production build precaches the actual hashed assets produced by Vite.
export function pwaBuild(){let output;
 return {name:'jaga-pwa-build',apply:'build',configResolved(config){output=resolve(config.root,config.build.outDir);},async closeBundle(){
   const files=await readdir(resolve(output,'assets'),{recursive:true});
   const assets=files.filter(file=>/\.(js|css|woff2?)$/.test(file)).sort().map(file=>'/assets/'+file.replaceAll('\\','/'));
   const template=await readFile(resolve(output,'sw.js'),'utf8'),html=await readFile(resolve(output,'index.html'),'utf8');
   const hash=createHash('sha256').update(template+html+JSON.stringify(assets));
   for(const file of ['offline.html','favicon.svg','manifest.webmanifest','icon-192.png','icon-512.png'])hash.update(await readFile(resolve(output,file)));
   const build=hash.digest('hex').slice(0,16);
   const source=template.replace('__JAGA_BUILD__',build).replace('/*__JAGA_PRECACHE__*/',assets.map(file=>JSON.stringify(file)).join(',')+(assets.length?',':''));
   await writeFile(resolve(output,'sw.js'),source);
 }};
}
