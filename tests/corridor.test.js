import test from 'node:test';
import assert from 'node:assert/strict';
import {parseLine,clipLine,chooseStops,etaText,palette} from '../web/corridor.js';
test('route clipping follows road vertices and rejects reverse or distant matches',()=>{
  const road=parseLine('LINESTRING (121 25, 121.001 25, 121.001 25.002, 121.003 25.002)');
  const segment=clipLine(road,{lon:121.0005,lat:25},{lon:121.002,lat:25.002});
  assert.equal(segment.length,4);assert.deepEqual(segment[1],[121.001,25]);
  assert.deepEqual(clipLine(road,{lon:121.002,lat:25.002},{lon:121,lat:25}),[]);
  assert.deepEqual(clipLine(road,{lon:122,lat:25},{lon:121.002,lat:25.002}),[]);
  assert.deepEqual(parseLine('LINESTRING (x y, 121 25)'),[]);assert.equal(palette['706'],'#8250dc');
});
test('station selection preserves route direction and pinned per-route UIDs',()=>{
  const stops=[0,1,2].map(i=>({StopUID:'S'+i,StopPosition:{PositionLon:121+i*.001,PositionLat:25}}));
  assert.deepEqual(chooseStops(stops,{lon:121,lat:25},{lon:121.002,lat:25},{board:'S1',alight:'S2'}),[1,2]);
  const [a,b]=chooseStops(stops,{lon:121.002,lat:25},{lon:121,lat:25});assert.ok(b>a);
});
test('ETA uses matching stop and direction, excludes unavailable service',()=>{
  const rows=[{StopUID:'S',Direction:0,StopStatus:0,EstimateTime:130},{StopUID:'S',Direction:1,StopStatus:0,EstimateTime:10},{StopUID:'S',Direction:0,StopStatus:1,EstimateTime:0}];
  assert.match(etaText(rows,{StopUID:'S'},0),/3 分鐘/);assert.match(etaText(rows,{StopUID:'other'},0),/暫無/);
});
