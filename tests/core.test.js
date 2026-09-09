import test from 'node:test';
import assert from 'node:assert/strict';
import {distance,defaults,validateSettings,normalize,ageSeconds} from '../web/core.js';
import worker,{parseRoutes} from '../worker/index.js';
test('distance uses metres, symmetric and stable for same/antipodal points',()=>{
  assert.equal(distance(defaults.origin,defaults.origin),0);
  const d=distance(defaults.origin,defaults.destination);assert.ok(d>3100&&d<3300);
  assert.equal(d,distance(defaults.destination,defaults.origin));
  assert.ok(Number.isFinite(distance({lat:0,lon:0},{lat:0,lon:180})));
});
test('settings reject malformed coordinates, private tokens and insecure APIs',()=>{
  assert.doesNotThrow(()=>validateSettings(defaults));
  for(const s of [{origin:{name:'x',lat:91,lon:0}},{destination:{name:'x',lat:NaN,lon:0}},{token:'sk.secret'},{api:'http://example.com'},{api:'https://user:pass@example.com'},{routes:[]},{routes:[{name:'57',city:'Unknown'}]},{routes:[defaults.routes[0],defaults.routes[0]]}])assert.throws(()=>validateSettings({...defaults,...s}));
});
test('GPS normalization filters route variants, invalid positions and duplicate older fixes',()=>{
  const row={RouteName:{Zh_tw:'57'},RouteUID:'NWT57',PlateNumb:'ABC-123',Direction:0,BusPosition:{PositionLat:25,PositionLon:121.5},GPSTime:'2026-09-09T13:00:00Z'};
  const result=normalize([row,{...row,GPSTime:'2026-09-09T12:59:00Z'},{...row,RouteName:{Zh_tw:'570'}},{...row,BusPosition:{PositionLat:null,PositionLon:121}}],{name:'57',city:'NewTaipei'});
  assert.equal(result.length,1);assert.equal(result[0].time,row.GPSTime);assert.equal(result[0].lat,25);
  assert.equal(ageSeconds(result[0],Date.parse(row.GPSTime)+121000),121);assert.equal(ageSeconds({time:null}),Infinity);
});
test('proxy validates route requests and does not expose credentials',async()=>{
  assert.throws(()=>parseRoutes('null'));assert.throws(()=>parseRoutes('[{"city":"Taipei","name":"../secret"}]'));
  assert.equal(parseRoutes(JSON.stringify(defaults.routes)).length,5);
  const env={ALLOWED_ORIGIN:'https://example.com'};
  const req=(origin,path='/vehicles?routes='+encodeURIComponent(JSON.stringify(defaults.routes)))=>new Request('https://proxy.test'+path,{headers:{Origin:origin}});
  assert.equal((await worker.fetch(req('https://bad.test'),env)).status,403);
  assert.equal((await worker.fetch(req(env.ALLOWED_ORIGIN),env)).status,503);
  assert.equal((await worker.fetch(req(env.ALLOWED_ORIGIN,'/vehicles?routes=oops'),env)).status,400);
});
test('proxy returns normalized live data and isolates partial upstream failure',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async url=>{if(String(url).includes('/token'))return Response.json({access_token:'test',expires_in:300});if(String(url).includes('/706?'))return new Response('',{status:429});return Response.json([{RouteName:{Zh_tw:'57'},PlateNumb:'TEST',BusPosition:{PositionLat:25,PositionLon:121},GPSTime:new Date().toISOString()}]);};
  try{const routes=defaults.routes.slice(0,2);const request=new Request('https://proxy.test/vehicles?routes='+encodeURIComponent(JSON.stringify(routes)),{headers:{Origin:'https://example.com'}});const r=await worker.fetch(request,{ALLOWED_ORIGIN:'https://example.com',TDX_CLIENT_ID:'id',TDX_CLIENT_SECRET:'secret'});assert.equal(r.status,200);const data=await r.json();assert.equal(data.vehicles.length,1);assert.equal(data.errors[0].route,'706');assert.ok(!JSON.stringify(data).includes('secret'));}finally{globalThis.fetch=original;}
});
