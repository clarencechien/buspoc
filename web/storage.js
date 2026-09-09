import {validateSettings} from './core.js';
import {cleanToken} from './tdx.js';
export const settingsKey='buspoc-direct-v3',tokenKey='buspoc-tdx-token',selectionKey='buspoc-corridor-selection',routePrefix='buspoc-route-v1:';
export function validateBackup(data){
  if(data?.format!=='buspoc-backup'||data.version!==1)throw Error('不是支援的 BusPOC 備份。');
  validateSettings(data.settings);
  if(data.tdxToken)data.tdxToken=cleanToken(data.tdxToken);
  if(!Array.isArray(data.routes)||data.routes.length>30)throw Error('路線備份格式不正確。');
  for(const item of data.routes){if(typeof item.key!=='string'||!item.key.startsWith(routePrefix)||!Array.isArray(item.value?.records)||!Array.isArray(item.value?.shapes)||!Number.isFinite(item.value.time))throw Error('路線資料格式不正確。');
    if(item.value.records.length>200||item.value.shapes.length>200)throw Error('路線資料過大。');
    for(const record of item.value.records){if(!Array.isArray(record.Stops)||record.Stops.length>1000)throw Error('站點資料格式不正確。');for(const s of record.Stops)if(typeof s.StopName?.Zh_tw!=='string'||!Number.isFinite(s.StopPosition?.PositionLat)||!Number.isFinite(s.StopPosition?.PositionLon))throw Error('站點資料不正確。');}
    for(const s of item.value.shapes)if(typeof s.Geometry!=='string')throw Error('線形資料不正確。');
  }
  if(data.selection&&(typeof data.selection.route!=='string'||!['0','1'].includes(String(data.selection.direction))))throw Error('乘車區段格式不正確。');return data;
}
export function exportBackup(storage,settings,token,includeToken){const routes=[];for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key.startsWith(routePrefix))try{routes.push({key,value:JSON.parse(storage.getItem(key))});}catch{}}
  return {format:'buspoc-backup',version:1,createdAt:new Date().toISOString(),settings,routes,selection:JSON.parse(storage.getItem(selectionKey)||'null'),...(includeToken?{tdxToken:token}: {})};
}
export function importBackup(storage,data){validateBackup(data);const entries=[[settingsKey,JSON.stringify(data.settings)],...data.routes.map(r=>[r.key,JSON.stringify(r.value)])];if(data.selection)entries.push([selectionKey,JSON.stringify(data.selection)]);if(data.tdxToken)entries.push([tokenKey,data.tdxToken]);const before=entries.map(([key])=>[key,storage.getItem(key)]);try{for(const [k,v]of entries)storage.setItem(k,v);}catch(e){for(const [k,v]of before){if(v===null)storage.removeItem(k);else storage.setItem(k,v);}throw Error('空間不足或瀏覽器禁止儲存，匯入未完成。');}return data;}
