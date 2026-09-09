import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {makeSegment} from '../web/overlays.js';
import {defaults} from '../web/core.js';
const data=JSON.parse(fs.readFileSync(new URL('../web/default-routes.json',import.meta.url)));
const pins=JSON.parse(fs.readFileSync(new URL('../web/commute-stops.json',import.meta.url)));
test('all five actual default TDX datasets produce boarding-to-alighting road segments',()=>{
  for(const route of defaults.routes){const segment=makeSegment(data[route.city+':'+route.name],route,defaults,pins,0);assert.ok(segment?.line.length>2,route.name);assert.ok(segment.stops.length>1);}
});
test('route switching produces deterministic results without mutating source datasets',()=>{
  const before=JSON.stringify(data);const route=defaults.routes[1];const first=makeSegment(data[route.city+':'+route.name],route,defaults,pins,0);
  for(const r of defaults.routes)makeSegment(data[r.city+':'+r.name],r,defaults,pins,1);
  assert.deepEqual(makeSegment(data[route.city+':'+route.name],route,defaults,pins,0),first);assert.equal(JSON.stringify(data),before);
});
