export const defaults = {
  origin: {name:'第一銀行連城分行',lat:24.99663,lon:121.48691},
  destination: {name:'臺灣銀行新永和分行',lat:25.01309,lon:121.51276},
  routes: ['57','706','243','214直','橘3'].map(name=>({name,city:name==='214直'?'Taipei':'NewTaipei'})),
  token:'', api:''
};
export function distance(a,b) {
  const r=Math.PI/180, dlat=(b.lat-a.lat)*r, dlon=(b.lon-a.lon)*r;
  const h=Math.sin(dlat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dlon/2)**2;
  return 6371000*2*Math.asin(Math.sqrt(Math.min(1,h)));
}
export const formatDistance=m=>m<1000?`${Math.round(m)} m`:`${(m/1000).toFixed(2)} km`;
export function validPoint(p) {return p && typeof p.lat==='number' && typeof p.lon==='number' && Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat)<=90 && Math.abs(p.lon)<=180;}
export function validateSettings(s) {
  for(const k of ['origin','destination']) if(!validPoint(s[k])||!s[k].name?.trim()||s[k].name.length>100) throw Error('A、B 請輸入名稱及有效經緯度。');
  if(!Array.isArray(s.routes)||!s.routes.length||s.routes.length>10) throw Error('請設定 1–10 條路線。');
  for(const r of s.routes) if(!['Taipei','NewTaipei'].includes(r.city)||typeof r.name!=='string'||!r.name.trim()||r.name.length>30||/[\x00-\x1f/?#]/.test(r.name)) throw Error('路線名稱或城市不正確。');
  if(new Set(s.routes.map(r=>r.city+':'+r.name)).size!==s.routes.length) throw Error('請移除重複路線。');
  if(s.token && !s.token.startsWith('pk.')) throw Error('Mapbox 請使用 pk. 開頭的公開 token。');
  if(s.api) {let u;try{u=new URL(s.api);}catch{throw Error('代理 URL 格式不正確。');}if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash) throw Error('代理 URL 請使用無參數的 HTTPS 網址。');}
  return s;
}
export function ageSeconds(v,now=Date.now()) {const t=Date.parse(v.time);return Number.isFinite(t)?Math.max(0,(now-t)/1000):Infinity;}
export function normalize(rows,route) {
  const byId=new Map();
  for(const r of rows) {
    if(r.RouteName?.Zh_tw!==route.name) continue;
    const p={lat:r.BusPosition?.PositionLat,lon:r.BusPosition?.PositionLon};
    if(!validPoint(p)||(p.lat===0&&p.lon===0)||!r.PlateNumb) continue;
    const v={...p,id:`${route.city}:${r.RouteUID||route.name}:${r.PlateNumb}`,route:route.name,city:route.city,plate:r.PlateNumb,direction:r.Direction,time:r.GPSTime||null,bearing:Number.isFinite(r.Azimuth)?r.Azimuth:null};
    const old=byId.get(v.id);if(!old||Date.parse(v.time)>Date.parse(old.time))byId.set(v.id,v);
  }
  return [...byId.values()];
}
export function demoVehicles(s) {
  return s.routes.map((r,i)=>({id:`demo-${i}`,route:r.name,city:r.city,plate:`示範 ${i+1}`,direction:i%2,lat:s.origin.lat+(i-1)*.002,lon:s.origin.lon+(i+1)*.002,time:new Date().toISOString(),bearing:40}));
}
