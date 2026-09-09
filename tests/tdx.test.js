import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchVehicles,cleanToken,errorLabel} from '../web/tdx.js';
import {defaults} from '../web/core.js';

test('token cleanup accepts pasted Bearer and rejects malformed input',()=>{
  assert.equal(cleanToken(' Bearer example.token '),'example.token');
  assert.throws(()=>cleanToken(''));assert.throws(()=>cleanToken('two tokens'));
});
test('direct requests send token only to TDX in header, normalize and isolate failure',async()=>{
  const calls=[];
  const fetcher=async(url,options)=>{
    calls.push({url:String(url),options});
    if(String(url).includes('/706?'))return new Response('',{status:429});
    return Response.json([{RouteName:{Zh_tw:'57'},PlateNumb:'TEST',BusPosition:{PositionLat:25,PositionLon:121.5},GPSTime:'2026-09-09T13:00:00Z'}]);
  };
  const result=await fetchVehicles(defaults.routes.slice(0,2),'test-token',undefined,fetcher);
  assert.equal(result.vehicles.length,1);assert.equal(result.errors[0].status,429);
  for(const c of calls){assert.equal(new URL(c.url).hostname,'tdx.transportdata.tw');assert.ok(!c.url.includes('test-token'));assert.equal(c.options.headers.Authorization,'Bearer test-token');assert.equal(c.options.credentials,'omit');}
  assert.ok(!JSON.stringify(result).includes('test-token'));
});
test('401 and CORS/network errors remain distinguishable from an empty fleet',async()=>{
  for(const [fetcher,status] of [[async()=>new Response('',{status:401}),401],[async()=>{throw new TypeError('Failed to fetch');},'network']]){
    const r=await fetchVehicles(defaults.routes.slice(0,1),'test',undefined,fetcher);
    assert.equal(r.errors[0].status,status);assert.equal(r.vehicles.length,0);assert.ok(errorLabel(status));
  }
});
test('aborted updates cannot return replacement data',async()=>{
  const c=new AbortController();c.abort();
  await assert.rejects(fetchVehicles(defaults.routes.slice(0,1),'test',c.signal,async()=>Response.json([])),{name:'AbortError'});
});
