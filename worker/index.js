import {normalize,validateSettings,defaults} from '../web/core.js';
let token=null,tokenUntil=0,tokenPending=null;
const inflight=new Map();
async function getToken(env){
  if(token&&Date.now()<tokenUntil)return token;
  if(tokenPending)return tokenPending;
  tokenPending=(async()=>{const r=await fetch('https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'client_credentials',client_id:env.TDX_CLIENT_ID,client_secret:env.TDX_CLIENT_SECRET}),signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('TDX authentication failed');const d=await r.json();if(!d.access_token)throw Error('TDX token missing');token=d.access_token;tokenUntil=Date.now()+Math.max(0,(Number(d.expires_in)||300)-60)*1000;return token;})();
  try{return await tokenPending;}finally{tokenPending=null;}
}
export function parseRoutes(raw){let routes;try{routes=JSON.parse(raw);}catch{throw Error('Invalid routes');}validateSettings({...defaults,routes});return routes;}
async function readRoute(route,env,cache){
  const id=`${route.city}/${route.name}`;
  if(inflight.has(id))return inflight.get(id);
  const job=(async()=>{
    const key=new Request('https://buspoc-cache.invalid/route/'+encodeURIComponent(id));
    const cached=await cache?.match(key);if(cached)return cached.json();
    const url=new URL(`https://tdx.transportdata.tw/api/basic/v2/Bus/RealTimeByFrequency/City/${route.city}/${encodeURIComponent(route.name)}`);url.searchParams.set('$format','JSON');
    const r=await fetch(url,{headers:{Authorization:'Bearer '+await getToken(env)},signal:AbortSignal.timeout(10000)});
    if(r.status===401){token=null;tokenUntil=0;}
    if(!r.ok)throw Error('TDX upstream failed');
    const rows=await r.json();if(!Array.isArray(rows))throw Error('TDX payload invalid');
    const result=normalize(rows,route);await cache?.put(key,new Response(JSON.stringify(result),{headers:{'Cache-Control':'public, max-age=30','Content-Type':'application/json'}}));return result;
  })();inflight.set(id,job);try{return await job;}finally{inflight.delete(id);}
}
export default {async fetch(request,env){
  const origin=request.headers.get('Origin'), allowed=env.ALLOWED_ORIGIN;
  if(!allowed||origin!==allowed)return new Response('Origin not allowed',{status:403});
  const headers={'Access-Control-Allow-Origin':allowed,'Vary':'Origin','Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Methods':'GET, OPTIONS'};
  const respond=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method!=='GET')return respond({error:'Method not allowed'},405);
  const url=new URL(request.url);if(url.pathname!=='/vehicles')return respond({error:'Not found'},404);
  let routes;try{routes=parseRoutes(url.searchParams.get('routes'));}catch{return respond({error:'Invalid routes: use 1–10 unique Taipei/NewTaipei routes'},400);}
  if(!env.TDX_CLIENT_ID||!env.TDX_CLIENT_SECRET)return respond({error:'TDX credentials not configured'},503);
  const cache=globalThis.caches?.default;
  const results=await Promise.allSettled(routes.map(r=>readRoute(r,env,cache)));
  const vehicles=[],errors=[];results.forEach((r,i)=>{if(r.status==='fulfilled')vehicles.push(...r.value);else errors.push({route:routes[i].name,city:routes[i].city,error:'TDX unavailable'});});
  if(errors.length===routes.length)return respond({error:'TDX unavailable',errors},502);
  return respond({vehicles,errors,fetchedAt:new Date().toISOString()});
}};
