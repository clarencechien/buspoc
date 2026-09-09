import test from 'node:test';
import assert from 'node:assert/strict';
import {distance,defaults,validateSettings,normalize,ageSeconds} from '../web/core.js';
test('distance uses metres, symmetric and stable for same/antipodal points',()=>{
  assert.equal(distance(defaults.origin,defaults.origin),0);
  const d=distance(defaults.origin,defaults.destination);assert.ok(d>3100&&d<3300);
  assert.equal(d,distance(defaults.destination,defaults.origin));
  assert.ok(Number.isFinite(distance({lat:0,lon:0},{lat:0,lon:180})));
});
test('settings reject malformed coordinates and private tokens',()=>{
  assert.doesNotThrow(()=>validateSettings(defaults));
  for(const s of [{origin:{name:'x',lat:91,lon:0}},{destination:{name:'x',lat:NaN,lon:0}},{token:'sk.secret'},{routes:[]},{routes:[{name:'57',city:'Unknown'}]},{routes:[defaults.routes[0],defaults.routes[0]]}])assert.throws(()=>validateSettings({...defaults,...s}));
});
test('GPS normalization filters route variants, invalid positions and duplicate older fixes',()=>{
  const row={RouteName:{Zh_tw:'57'},RouteUID:'NWT57',PlateNumb:'ABC-123',Direction:0,BusPosition:{PositionLat:25,PositionLon:121.5},GPSTime:'2026-09-09T13:00:00Z'};
  const result=normalize([row,{...row,GPSTime:'2026-09-09T12:59:00Z'},{...row,RouteName:{Zh_tw:'570'}},{...row,BusPosition:{PositionLat:null,PositionLon:121}}],{name:'57',city:'NewTaipei'});
  assert.equal(result.length,1);assert.equal(result[0].time,row.GPSTime);assert.equal(result[0].lat,25);
  assert.equal(ageSeconds(result[0],Date.parse(row.GPSTime)+121000),121);assert.equal(ageSeconds({time:null}),Infinity);
});
