import {normalize,validateSettings,defaults} from './core.js';

export function cleanToken(value) {
  const token=value.trim().replace(/^Bearer\s+/i,'');
  if(!token||/\s/.test(token)||token.length>16000)throw Error('請貼上有效的 TDX Access Token，不是 Client Secret。');
  return token;
}
export function errorLabel(status) {
  if(status===401)return 'Token 無效或已過期，請重新輸入。';
  if(status===403)return 'TDX 拒絕存取，請確認帳號 API 權限。';
  if(status===429)return 'TDX 呼叫頻率超限，暫停至少 60 秒後重試。';
  if(status==='network')return '無法連線至 TDX，可能是網路或跨網域（CORS）限制。';
  return `TDX 資料讀取失敗${typeof status==='number'?`（HTTP ${status}）`:''}。`;
}
export async function fetchVehicles(routes,token,signal,fetcher=fetch) {
  validateSettings({...defaults,routes});
  token=cleanToken(token);
  const results=await Promise.allSettled(routes.map(async route=>{
    const url=new URL(`https://tdx.transportdata.tw/api/basic/v2/Bus/RealTimeByFrequency/City/${route.city}/${encodeURIComponent(route.name)}`);
    url.searchParams.set('$format','JSON');
    let response;
    try{response=await fetcher(url,{headers:{Authorization:`Bearer ${token}`},signal,credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});}
    catch(e){if(signal?.aborted)throw e;throw Object.assign(Error('Network error'),{status:'network'});}
    if(!response.ok)throw Object.assign(Error('TDX request failed'),{status:response.status});
    const rows=await response.json();if(!Array.isArray(rows))throw Error('Invalid response');
    return normalize(rows,route);
  }));
  if(signal?.aborted)throw new DOMException('Aborted','AbortError');
  const vehicles=[],errors=[];
  results.forEach((r,i)=>{if(r.status==='fulfilled')vehicles.push(...r.value);else errors.push({route:routes[i].name,city:routes[i].city,status:r.reason?.status||'invalid'});});
  return {vehicles,errors,fetchedAt:new Date().toISOString()};
}
