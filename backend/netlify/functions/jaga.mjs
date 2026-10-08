import {createAPI} from '../../api.mjs';
let handle;
export default async function(req){
  if(!handle)handle=createAPI({uri:Netlify.env.get('MONGODB_URI'),database:Netlify.env.get('MONGODB_DATABASE')||'jaga',apiKey:Netlify.env.get('JAGA_API_KEY'),ownerEmail:Netlify.env.get('OWNER_EMAIL')});
  return handle(req);
}
export const config={path:['/health','/ready','/auth/*','/state','/versions','/versions/*'],method:['GET','POST','PUT']};
