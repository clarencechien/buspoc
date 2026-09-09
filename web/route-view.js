import {tdxQuery,errorLabel} from './tdx.js';
import {parseLine,clipLine,chooseStops,stopPoint,etaText} from './corridor.js';
import {distance,validPoint} from './core.js';
const $=s=>document.querySelector(s),empty=()=>({type:'FeatureCollection',features:[]});
export function setupCorridor(getSettings,getToken,getMap,colorOf,onError){
  let records=[],shapes=[],activeStops=[],line=[],currentRoute=null,controller=null,version=0;
  let pins=null;fetch('./commute-stops.json').then(r=>r.json()).then(d=>pins=d).catch(()=>{});
  function clearMap(){const m=getMap();for(const id of ['commute-line','commute-stops'])m?.getSource(id)?.setData(empty());line=[];}
  function draw(){
    const m=getMap();if(!m?.isStyleLoaded()||!activeStops.length||!currentRoute)return;
    const a=Number($('#board-stop').value),b=Number($('#alight-stop').value);clearMap();
    if(b<=a){$('#corridor-status').textContent='下車站必須位於上車站之後，請調整站點或方向。';return;}
    const direction=Number($('#corridor-direction').value),record=records.find(r=>r.Direction===direction&&r.Stops===activeStops);
    const candidates=shapes.filter(r=>r.Direction===direction&&(!record?.SubRouteUID||r.SubRouteUID===record.SubRouteUID));
    for(const c of candidates){line=clipLine(parseLine(c.Geometry),stopPoint(activeStops[a]),stopPoint(activeStops[b]));if(line.length)break;}
    const color=colorOf(currentRoute);
    const routeData={type:'FeatureCollection',features:line.length?[{type:'Feature',properties:{color},geometry:{type:'LineString',coordinates:line}}]:[]};
    const stopsData={type:'FeatureCollection',features:activeStops.slice(a,b+1).map((s,i)=>({type:'Feature',properties:{color,label:i===0?'上車 · '+s.StopName.Zh_tw:i===b-a?'下車 · '+s.StopName.Zh_tw:s.StopName.Zh_tw,edge:i===0||i===b-a},geometry:{type:'Point',coordinates:[stopPoint(s).lon,stopPoint(s).lat]}}))};
    if(!m.getSource('commute-line')){
      m.addSource('commute-line',{type:'geojson',data:empty()});m.addSource('commute-stops',{type:'geojson',data:empty()});
      m.addLayer({id:'commute-glow',type:'line',slot:'middle',source:'commute-line',paint:{'line-color':['get','color'],'line-width':18,'line-opacity':.2,'line-blur':5}});
      m.addLayer({id:'commute-path',type:'line',slot:'middle',source:'commute-line',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['get','color'],'line-width':6,'line-opacity':.95}});
      m.addLayer({id:'commute-stop-dots',type:'circle',slot:'top',source:'commute-stops',paint:{'circle-radius':['case',['get','edge'],8,4],'circle-color':['get','color'],'circle-stroke-color':'#ffffff','circle-stroke-width':2}});
      m.addLayer({id:'commute-stop-labels',type:'symbol',slot:'top',source:'commute-stops',layout:{'text-field':['get','label'],'text-size':13,'text-offset':[0,1.5]},paint:{'text-color':['get','color'],'text-halo-color':'#fff','text-halo-width':2}});
    }
    m.getSource('commute-line').setData(routeData);m.getSource('commute-stops').setData(stopsData);
    $('#corridor-status').textContent=`${currentRoute.name} · ${activeStops[a].StopName.Zh_tw} → ${activeStops[b].StopName.Zh_tw} · ${b-a+1} 站。${line.length?'實際路線區段。':'未取得可匹配的道路線形；僅顯示站點。'}`;
  }
  function stationOptions(){
    const settings=getSettings(),direction=Number($('#corridor-direction').value);
    const candidates=records.filter(r=>r.Direction===direction);activeStops=candidates[0]?.Stops||[];
    const isOriginal=pins&&distance(settings.origin,pins.origin)<20&&distance(settings.destination,pins.destination)<20;
    const board=pins?.boarding.find(r=>r.route===currentRoute?.name&&r.city===currentRoute?.city&&r.direction===direction&&r.stop===(currentRoute.name==='橘3'?'建一路':currentRoute.name==='243'?'台貿一村':'連城中正路口'));
    const alight=pins?.alighting.find(r=>r.route===currentRoute?.name)?.best;
    // Prefer the subroute containing both pinned stops when several variants exist.
    if(isOriginal&&board&&alight){activeStops=candidates.find(r=>r.Stops.some(s=>s.StopUID===board.StopUID)&&r.Stops.some(s=>s.StopUID===alight.StopUID))?.Stops||activeStops;}
    for(const id of ['board-stop','alight-stop']){$('#'+id).replaceChildren(...activeStops.map((s,i)=>new Option(`${i+1} · ${s.StopName.Zh_tw}`,String(i))));$('#'+id).disabled=!activeStops.length;}
    const pair=chooseStops(activeStops,settings.origin,settings.destination,isOriginal&&board&&alight?{board:board.StopUID,alight:alight.StopUID}:null);
    if(pair){$('#board-stop').value=pair[0];$('#alight-stop').value=pair[1];draw();}else{$('#corridor-status').textContent='此方向沒有可用站點，請切換方向。';clearMap();}
    $('#eta-status').textContent='站點變更後請重新查詢到站預估。';
  }
  function reset(){version++;controller?.abort();records=[];shapes=[];activeStops=[];currentRoute=null;clearMap();for(const id of ['board-stop','alight-stop']){$('#'+id).replaceChildren();$('#'+id).disabled=true;}$('#corridor-status').textContent='請載入所選路線，站點與線形會快取 24 小時。';$('#eta-status').textContent='到站預估需另查，不等於車輛距離排名。';$('#load-corridor').disabled=false;$('#get-eta').disabled=false;}
  function configure(){reset();$('#corridor-route').replaceChildren(...getSettings().routes.map((r,i)=>new Option(r.name,String(i))));$('#corridor-route').value=String(Math.max(0,getSettings().routes.findIndex(r=>r.name==='706')));}
  $('#load-corridor').onclick=async()=>{
    reset();const route=getSettings().routes[Number($('#corridor-route').value)];if(!route)return;
    const token=getToken(),id=version;currentRoute=route;const cacheKey='buspoc-route-v1:'+route.city+':'+route.name;
    try{const cached=JSON.parse(localStorage.getItem(cacheKey)||'null');if(cached&&Date.now()-cached.time<86400000){records=cached.records;shapes=cached.shapes;stationOptions();return;}}catch{}
    if(!token){$('#corridor-status').textContent='請先在設定輸入 TDX Token。';return;}
    controller=new AbortController();const activeController=controller;const signal=activeController.signal;const timer=setTimeout(()=>activeController.abort(),45000);$('#load-corridor').disabled=true;$('#corridor-status').textContent='正在依序讀取站點與路線…';
    try{
      const stops=await tdxQuery('StopOfRoute',route,token,signal);if(id!==version)return;
      records=stops.filter(r=>r.RouteName?.Zh_tw===route.name).map(r=>({...r,Stops:(r.Stops||[]).filter(s=>validPoint(stopPoint(s))).sort((a,b)=>a.StopSequence-b.StopSequence)}));
      let shapeFailed=false;try{shapes=await tdxQuery('Shape',route,token,signal);}catch(e){shapeFailed=true;onError(e.status);shapes=[];}if(id!==version)return;
      if(!shapeFailed)try{localStorage.setItem(cacheKey,JSON.stringify({time:Date.now(),records,shapes}));}catch{}
      stationOptions();
    }catch(e){if(id===version){$('#corridor-status').textContent=errorLabel(e.status);onError(e.status);}}
    finally{clearTimeout(timer);if(id===version)$('#load-corridor').disabled=false;}
  };
  $('#corridor-route').onchange=reset;$('#corridor-direction').onchange=()=>{version++;controller?.abort();$('#get-eta').disabled=false;$('#load-corridor').disabled=false;stationOptions();};
  for(const id of ['board-stop','alight-stop'])$('#'+id).onchange=()=>{version++;controller?.abort();$('#get-eta').disabled=false;$('#eta-status').textContent='站點變更後請重新查詢到站預估。';draw();};
  $('#route-fit').onclick=()=>{if(!line.length)return;const m=getMap();if(m)m.fitBounds(line.reduce((b,p)=>b.extend(p),new mapboxgl.LngLatBounds()),{padding:80,maxZoom:16,pitch:55});};
  $('#get-eta').onclick=async()=>{const stop=activeStops[Number($('#board-stop').value)];if(!stop||!getToken()){$('#eta-status').textContent='請先載入路線與設定 Token。';return;}const id=version;const direction=Number($('#corridor-direction').value);controller?.abort();const c=new AbortController();controller=c;const timer=setTimeout(()=>c.abort(),30000);$('#get-eta').disabled=true;$('#eta-status').textContent='查詢官方到站預估…';try{const data=await tdxQuery('EstimatedTimeOfArrival',currentRoute,getToken(),c.signal);if(id===version)$('#eta-status').textContent=etaText(data,stop,direction)+' · '+new Date().toLocaleTimeString('zh-TW');}catch(e){if(id===version){$('#eta-status').textContent=errorLabel(e.status);onError(e.status);}}finally{clearTimeout(timer);if(id===version)$('#get-eta').disabled=false;}};
  configure();return {configure,draw,reset};
}
