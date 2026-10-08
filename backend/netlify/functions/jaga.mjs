import {createAPI} from '../../api.mjs';
import {browserRequest} from '../../browser.mjs';
let handle;
export default async function(req,context){
  if(!handle)handle=createAPI({uri:Netlify.env.get('MONGODB_URI'),database:Netlify.env.get('MONGODB_DATABASE')||'jaga',apiKey:Netlify.env.get('JAGA_API_KEY')});
  if(new URL(req.url).pathname.startsWith('/api/cloud/'))return browserRequest(req,handle,Netlify.env.get('JAGA_API_KEY'),context?.ip);
  return handle(req);
}
export const config={path:['/api/cloud/*','/health','/ready','/auth/*','/state','/versions','/versions/*'],method:['GET','POST','PUT']};
