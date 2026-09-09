import {createOverlays} from './overlays.js';
import {tokenKey,exportBackup,importBackup} from './storage.js';
import {setupWeather} from './weather.js';
import {defaults,validateSettings,distance,formatDistance,ageSeconds,demoVehicles} from './core.js';
import {createBusLayer} from './buses3d.js';
import {palette} from './corridor.js';
import {setupCorridor} from './route-view.js';
import {cleanToken,fetchVehicles,errorLabel} from './tdx.js';
const $=s=>document.querySelector(s), colors=['#176ad5','#7753b5','#127b70','#b64868','#bd610d'];
const copy=o=>structuredClone(o), key='buspoc-direct-v3';
let settings={...copy(defaults),...window.BUSPOC_CONFIG}, storageWarning='';
try {const saved=localStorage.getItem(key);if(saved)settings=validateSettings(JSON.parse(saved));}catch{storageWarning='無法讀取已存設定，使用預設值。';}
let map, points=[], markers=new Map(), vehicles=[], enabled=new Set(), selected=null, me=null, picking=null, controller=null, generation=0, popup=null, fetched=null, failures=[], loadError='', hasSnapshot=false;
let tdxToken='',weather=null,overlays=null,nextFetchAt=0,busLayer=null,corridor=null,sceneIndex=0;
try{tdxToken=localStorage.getItem(tokenKey)||'';}catch{}
function persistToken(){try{if(tdxToken)localStorage.setItem(tokenKey,tdxToken);else localStorage.removeItem(tokenKey);}catch{message('無法保存 TDX Token，這次僅存於頁面記憶體。');}}
const routeKey=r=>r.city+':'+(r.name||r.route);
const routeColor=v=>palette[v.name||v.route]||colors[Math.max(0,settings.routes.findIndex(r=>routeKey(r)===routeKey(v)))%colors.length];
const message=s=>$('#map-message').textContent=s;
function save(s){settings=s;try{localStorage.setItem(key,JSON.stringify(s));return true;}catch{message('設定已套用，但瀏覽器無法儲存；重新開啟後需再次設定。');return false;}}
function initRoutes(){enabled=new Set(settings.routes.map(routeKey));$('#routes').replaceChildren(...settings.routes.map(r=>{const b=document.createElement('button');b.textContent=r.name;b.title=r.city;b.setAttribute('aria-pressed','true');b.onclick=()=>{const k=routeKey(r);enabled.has(k)?enabled.delete(k):enabled.add(k);b.setAttribute('aria-pressed',String(enabled.has(k)));render();overlays?.render();};return b;}));}
function updateJourney(){for(const p of ['origin','destination'])$('#'+p+'-name').textContent=settings[p].name;$('#od-distance').textContent=`A → B 直線 ${formatDistance(distance(settings.origin,settings.destination))}`;}
function addPoint(p,label,kind){const el=document.createElement('div');el.className='point-marker '+kind;el.textContent=kind==='me'?label:label+' · '+p.name;el.title=p.name||'我的位置';points.push(new mapboxgl.Marker({element:el}).setLngLat([p.lon,p.lat]).addTo(map));}
function drawPoints(){if(!map)return;points.forEach(m=>m.remove());points=[];addPoint(settings.origin,'A','origin');addPoint(settings.destination,'B','destination');if(me)addPoint(me,'我','me');}
function fit(){if(!map)return;map.fitBounds([[Math.min(settings.origin.lon,settings.destination.lon),Math.min(settings.origin.lat,settings.destination.lat)],[Math.max(settings.origin.lon,settings.destination.lon),Math.max(settings.origin.lat,settings.destination.lat)]],{padding:80,maxZoom:16,pitch:map.getPitch(),duration:800});}
function initMap(){
  busLayer=null;
  popup?.remove();popup=null;markers.forEach(m=>m.remove());markers.clear();points.forEach(m=>m.remove());points=[];map?.remove();map=null;
  $('#map-empty').hidden=false;
  if(!settings.token)return;
  if(!window.mapboxgl){message('Mapbox 載入失敗，請確認網路並重新整理。');return;}
  try {
    map=new mapboxgl.Map({container:'map',accessToken:settings.token,style:'mapbox://styles/mapbox/standard',center:[settings.origin.lon,settings.origin.lat],zoom:15.5,pitch:60,bearing:-18,config:{basemap:{lightPreset:'day'}},antialias:true});
    $('#view-toggle').textContent='切換 2D';
    map.addControl(new mapboxgl.NavigationControl(),'top-right');
    map.on('load',async()=>{$('#map-empty').hidden=true;message('');drawPoints();render();corridor?.draw();overlays?.render();const currentMap=map;try{const layer=await createBusLayer(currentMap,()=>message('3D 車體載入失敗，保留公車標籤。'));if(map===currentMap){busLayer=layer;render();}}catch{if(map===currentMap)message('3D 車體載入失敗，保留公車標籤。');}});
    map.on('error',()=>message('地圖載入異常，請檢查 Mapbox token、網域限制與網路。'));
    map.on('click',e=>{if(!picking)return;const k=picking;picking=null;const f=$('#settings-form');f.elements[k+'-lat'].value=e.lngLat.lat.toFixed(6);f.elements[k+'-lon'].value=e.lngLat.lng.toFixed(6);map.getCanvas().style.cursor='';message('');$('#settings').showModal();});
  }catch{message('此裝置無法啟動 3D 地圖，請確認 WebGL 支援與 token。');}
}
function reference(){return $('#reference').value==='me'&&me?me:settings.origin;}
function visible(){return vehicles.filter(v=>enabled.has(routeKey(v))&&($('#direction').value==='all'||String(v.direction)===$('#direction').value)&&ageSeconds(v)<600).map(v=>({...v,meters:distance(reference(),v)})).sort((a,b)=>a.meters-b.meters);}
function ageLabel(v){const age=ageSeconds(v);return !Number.isFinite(age)?'定位時間未知':age<60?`${Math.floor(age)} 秒前定位`:`${Math.floor(age/60)} 分前定位`;}
function directionLabel(v){return v.direction===0?'去程':v.direction===1?'返程':'方向未知';}
function focusBus(v){selected=v.id;render();if(map){map.flyTo({center:[v.lon,v.lat],zoom:16,pitch:map.getPitch(),duration:800});popup?.remove();const box=document.createElement('div'),strong=document.createElement('strong'),details=document.createElement('div');strong.textContent=`${v.route} · ${v.plate}`;details.textContent=`${directionLabel(v)}｜距${$('#reference').value==='me'?'我':' A 點'} ${formatDistance(v.meters)}（直線）｜${ageLabel(v)}`;box.append(strong,details);popup=new mapboxgl.Popup({offset:25}).setLngLat([v.lon,v.lat]).setDOMContent(box).addTo(map);}}
function render(){
  const ranked=visible(),list=$('#nearest-only').checked?ranked.slice(0,3):ranked;
  const demo=$('#mode').value==='demo', failed=failures.length?` ${failures.map(r=>`${r.route}：${errorLabel(r.status)}`).join('；')} 查詢失敗。`:'';
  $('#status').className=demo?'demo':'';
  $('#status').textContent=demo?'示範資料 · 非真實公車位置，不可用於候車。':loadError?loadError+ (hasSnapshot?' 保留上次資料，請留意定位時間。':''):fetched?`${list.length} 輛可見 · ${new Date(fetched).toLocaleTimeString('zh-TW')} 更新${failed}`:tdxToken?'正在取得公車位置…':'請到「路線與設定」輸入 TDX Access Token。';
  $('#vehicles').replaceChildren();
  if(!list.length){const p=document.createElement('p');p.className='empty';p.textContent=hasSnapshot||demo?'目前篩選下沒有可顯示的車輛。超過 10 分鐘或時間未知的定位會隱藏。':'連接資料後，這裡會依距離排列公車。';$('#vehicles').append(p);}
  for(const [rank,v] of list.entries()){const stale=ageSeconds(v)>120,b=document.createElement('button');b.className='bus-card'+(selected===v.id?' selected':'');b.style.setProperty('--route',routeColor(v));const top=document.createElement('div');top.className='bus-top';const badge=document.createElement('span');badge.className='route-badge';badge.textContent=(rank<3?`${rank+1} · `:'')+v.route;const d=document.createElement('span');d.className='bus-distance';d.textContent=formatDistance(v.meters);top.append(badge,d);const info=document.createElement('div');info.className='bus-info'+(stale?' stale':'');info.textContent=`${v.plate} · ${directionLabel(v)} · ${ageLabel(v)}${stale?' · 資料過期':''}`;b.append(top,info);b.onclick=()=>focusBus(v);$('#vehicles').append(b);}
  if(!map)return;
  busLayer?.update(list.slice(0,30),reference(),routeColor);
  const ids=new Set(list.map(v=>v.id));for(const [id,m] of markers)if(!ids.has(id)){m.remove();markers.delete(id);}
  for(const [rank,v] of list.entries()){let marker=markers.get(v.id);if(!marker){const el=document.createElement('button');marker=new mapboxgl.Marker({element:el,offset:[0,-30]}).setLngLat([v.lon,v.lat]).addTo(map);markers.set(v.id,marker);}const el=marker.getElement();el.className='bus-marker'+(ageSeconds(v)>120?' stale':'')+(selected===v.id?' selected':'');el.style.setProperty('--route',routeColor(v));el.textContent=`${rank<3?'❶❷❸'[rank]:'▤'} ${v.route} · ${formatDistance(v.meters)}`;el.classList.toggle('nearest',rank<3);el.setAttribute('aria-label',`${v.route} 公車 ${v.plate}，${formatDistance(v.meters)}`);el.onclick=e=>{e.stopPropagation();focusBus(v);};marker.setLngLat([v.lon,v.lat]);}
}
async function refresh(){
  if(Date.now()<nextFetchAt&&$('#mode').value==='live'){loadError='TDX 呼叫頻率超限，暫停至少 60 秒後重試。';render();return;}
  controller?.abort();controller=new AbortController();const current=++generation;loadError='';
  $('#refresh').disabled=false;
  if($('#mode').value==='demo'){vehicles=demoVehicles(settings);hasSnapshot=true;failures=[];render();return;}
  if(!tdxToken||!enabled.size){render();return;}
  $('#refresh').disabled=true;
  const activeController=controller;
  const timeout=setTimeout(()=>activeController.abort(),20000);
  try {
    const data=await fetchVehicles(settings.routes.filter(r=>enabled.has(routeKey(r))),tdxToken,activeController.signal);
    if(current!==generation)return;
    failures=data.errors;
    if(failures.some(e=>e.status===429))nextFetchAt=Date.now()+60000;
    if(failures.some(e=>e.status===401)){tdxToken='';persistToken();loadError=errorLabel(401);return;}
    if(failures.length===settings.routes.filter(r=>enabled.has(routeKey(r))).length){loadError=[...new Set(failures.map(e=>errorLabel(e.status)))].join(' ');return;}
    vehicles=data.vehicles;fetched=data.fetchedAt;hasSnapshot=true;popup?.remove();popup=null;
  }catch{if(current!==generation)return;loadError=activeController.signal.aborted?'TDX 連線逾時，請稍後重試。':'TDX 讀取失敗，請檢查連線。';}
  finally{clearTimeout(timeout);if(current===generation){$('#refresh').disabled=false;render();}}
}
function fillForm(){const f=$('#settings-form');for(const p of ['origin','destination'])for(const k of ['name','lat','lon'])f.elements[p+'-'+k].value=settings[p][k];f.elements.routes.value=settings.routes.map(r=>`${r.city},${r.name}`).join('\n');f.elements.token.value=settings.token;f.elements['tdx-token'].value='';$('#tdx-state').textContent=tdxToken?'已保存於此瀏覽器；留白會沿用，過期後需更新。':'尚未設定。儲存後會保留於此瀏覽器。';$('#settings-error').textContent='';}
function openSettings(){fillForm();$('#settings').showModal();}
$('#settings-open').onclick=openSettings;$('#setup').onclick=openSettings;$('#settings-close').onclick=()=>$('#settings').close();
$('#settings-form').onsubmit=e=>{e.preventDefault();const f=e.currentTarget;try{const s={routes:f.elements.routes.value.trim().split('\n').map(line=>{const [city,name,...extra]=line.split(',').map(x=>x.trim());return {city,name:extra.length?'':name};}),token:f.elements.token.value.trim()};for(const p of ['origin','destination'])s[p]={name:f.elements[p+'-name'].value.trim(),lat:Number(f.elements[p+'-lat'].value),lon:Number(f.elements[p+'-lon'].value)};validateSettings(s);const mapChanged=settings.token!==s.token;const entered=f.elements['tdx-token'].value.trim();const nextToken=entered?cleanToken(entered):tdxToken;tdxToken=nextToken;persistToken();f.elements['tdx-token'].value='';nextFetchAt=0;const persisted=save(s);$('#settings').close();vehicles=[];fetched=null;hasSnapshot=false;selected=null;popup?.remove();popup=null;initRoutes();updateJourney();corridor?.configure();overlays?.render();if(mapChanged)initMap();else drawPoints();if(persisted)message('');weather?.update();refresh();}catch(err){$('#settings-error').textContent=err.message;}};
$('#clear-tdx').onclick=()=>{tdxToken='';persistToken();controller?.abort();generation++;$('#refresh').disabled=false;vehicles=[];hasSnapshot=false;fetched=null;failures=[];loadError='';$('#settings-form').elements['tdx-token'].value='';$('#tdx-state').textContent='已清除。';corridor?.reset();popup?.remove();render();};
$('#settings').addEventListener('close',()=>{$('#settings-form').elements['tdx-token'].value='';});
$('#reset').onclick=()=>{const f=$('#settings-form');for(const p of ['origin','destination'])for(const k of ['name','lat','lon'])f.elements[p+'-'+k].value=defaults[p][k];f.elements.routes.value=defaults.routes.map(r=>`${r.city},${r.name}`).join('\n');};
document.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>{if(!map||!map.loaded()){$('#settings-error').textContent='請先儲存有效 token 並等待地圖載入。';return;}picking=b.dataset.pick;$('#settings').close();map.getCanvas().style.cursor='crosshair';message(`請點地圖設定 ${picking==='origin'?'A':'B'}，按 Esc 取消。`);});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&picking){picking=null;map.getCanvas().style.cursor='';message('');$('#settings').showModal();}});
$('#view-toggle').onclick=()=>{if(!map)return;const is3d=map.getPitch()>0;map.easeTo({pitch:is3d?0:60,duration:600});$('#view-toggle').textContent=is3d?'切換 3D':'切換 2D';};$('#fit').onclick=fit;
$('#locate').onclick=()=>{if(!navigator.geolocation){message('此瀏覽器不支援定位。');return;}message('正在取得你的位置…');navigator.geolocation.getCurrentPosition(p=>{me={lat:p.coords.latitude,lon:p.coords.longitude};$('#reference').value='me';message(`定位精度約 ±${Math.round(p.coords.accuracy)} m；再次按定位可更新。`);drawPoints();render();map?.flyTo({center:[me.lon,me.lat],zoom:16});},()=>{message('無法取得位置。請允許定位或繼續使用 A 點。');},{enableHighAccuracy:true,timeout:15000,maximumAge:0});};
$('#reference').onchange=()=>{if($('#reference').value==='me'&&!me){$('#reference').value='origin';$('#locate').click();}popup?.remove();render();};$('#direction').onchange=()=>{popup?.remove();render();overlays?.render();};$('#refresh').onclick=refresh;$('#mode').onchange=()=>{vehicles=[];fetched=null;hasSnapshot=false;popup?.remove();$('#refresh').disabled=false;refresh();};
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();else{controller?.abort();generation++;$('#refresh').disabled=false;}});
setInterval(()=>{if(!document.hidden&&$('#mode').value==='live'&&!$('#refresh').disabled)refresh();},45000);
setInterval(()=>{if(!document.hidden)render();},10000);
$('#select-all-routes').onclick=()=>{initRoutes();render();overlays?.render();};
$('#nearest-only').onchange=render;
$('#nearest-fit').onclick=()=>{if(!map)return;const top=visible().slice(0,3);if(!top.length){message('目前沒有可用公車位置。');return;}const b=new mapboxgl.LngLatBounds();b.extend([reference().lon,reference().lat]);top.forEach(v=>b.extend([v.lon,v.lat]));map.fitBounds(b,{padding:90,maxZoom:16.5,pitch:60});};
$('#scene-toggle').onclick=()=>{if(!map)return;sceneIndex=(sceneIndex+1)%3;map.setConfigProperty('basemap','lightPreset',['day','dusk','night'][sceneIndex]);$('#scene-toggle').textContent=['黃昏景色','夜間景色','日間景色'][sceneIndex];};
$('#export-backup').onclick=()=>{try{const data=exportBackup(localStorage,settings,tdxToken,$('#export-token').checked);const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='buspoc-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('#backup-status').textContent='已匯出設定、載入的路線與站點選擇。'+(data.tdxToken?' 此檔案包含授權 Token，請自行保管。':' 未包含 TDX Token。');}catch{$('#backup-status').textContent='無法讀取備份資料。';}};
$('#import-backup').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>10000000)throw Error('備份檔不能超過 10MB。');const data=importBackup(localStorage,JSON.parse(await file.text()));settings=data.settings;if(data.tdxToken)tdxToken=data.tdxToken;persistToken();vehicles=[];hasSnapshot=false;fetched=null;initRoutes();updateJourney();initMap();corridor.configure();weather.update();fillForm();$('#backup-status').textContent='匯入完成，已套用設定與路線。';refresh();}catch(err){$('#backup-status').textContent=err.message;}finally{e.target.value='';}};
weather=setupWeather(()=>settings.origin);weather.update();
initRoutes();updateJourney();overlays=createOverlays(()=>settings,()=>map,()=>enabled,()=>$('#direction').value,routeColor);corridor=setupCorridor(()=>settings,()=>tdxToken,()=>map,routeColor,status=>{if(status===401){tdxToken='';persistToken();}if(status===429)nextFetchAt=Date.now()+60000;},overlays);initMap();render();refresh();if(storageWarning)message(storageWarning);
