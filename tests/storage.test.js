import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults} from '../web/core.js';
import {exportBackup,importBackup,validateBackup,tokenKey,routePrefix} from '../web/storage.js';
function memory(){const m=new Map();return {get length(){return m.size},key:i=>[...m.keys()][i],getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};}
test('backup roundtrip preserves route data; token export is explicit',()=>{
  const source=memory();source.setItem(routePrefix+'NewTaipei:706',JSON.stringify({time:Date.now(),records:[],shapes:[]}));
  const without=exportBackup(source,defaults,'private-token',false);assert.ok(!JSON.stringify(without).includes('private-token'));
  const withToken=exportBackup(source,defaults,'private-token',true),target=memory();importBackup(target,withToken);assert.equal(target.getItem(tokenKey),'private-token');assert.ok(target.getItem(routePrefix+'NewTaipei:706'));
});
test('invalid backup cannot write arbitrary storage keys or malformed station data',()=>{
  assert.throws(()=>validateBackup({format:'unknown',version:1}));
  const data={format:'buspoc-backup',version:1,settings:defaults,routes:[{key:'arbitrary',value:{records:[],shapes:[],time:1}}]};assert.throws(()=>validateBackup(data));
});
