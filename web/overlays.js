import {matchShape,chooseStops,stopPoint} from './corridor.js';
import {distance,validPoint} from './core.js';
export function makeSegment(data,route,settings,pins,direction){
  const original=distance(settings.origin,pins.origin)<20&&distance(settings.destination,pins.destination)<20;
  const board=pins.boarding.find(r=>r.route===route.name&&r.city===route.city&&r.direction===direction&&r.stop===(route.name==='橘3'?'建一路':route.name==='243'?'台貿一村':'連城中正路口'));
  const alight=pins.alighting.find(r=>r.route===route.name)?.best;
  let best=null,score=Infinity;
  for(const record of data.records||[]){
    if(Number(record.Direction)!==direction)continue;
    const stops=(record.Stops||[]).filter(s=>validPoint(stopPoint(s))).sort((a,b)=>a.StopSequence-b.StopSequence);
    const pair=chooseStops(stops,settings.origin,settings.destination,original&&board&&alight?{board:board.StopUID,alight:alight.StopUID}:null);if(!pair)continue;
    const selected=stops.slice(pair[0],pair[1]+1),line=matchShape(data.shapes||[],record,selected);
    const cost=distance(settings.origin,stopPoint(selected[0]))+distance(settings.destination,stopPoint(selected.at(-1)))+(line.length?0:100000);
    if(cost<score){score=cost;best={line,stops:selected,direction};}
  }return best;
}
export function createOverlays(getSettings,getMap,getEnabled,getDirection,colorOf){
  let defaults={},pins=null,overrides=new Map(),segments=[],flags=[];
  const key=r=>r.city+':'+r.name;
  function render(){
    const map=getMap();if(!pins||!map||(!map.getSource('route-overlays')&&!map.isStyleLoaded()))return;
    const settings=getSettings(),direction=getDirection()==='all'?0:Number(getDirection());segments=[];
    const missing=[];
    const enabled=settings.routes.filter(r=>getEnabled().has(key(r)));
    for(const route of enabled){let data=defaults[key(route)];try{const cached=JSON.parse(localStorage.getItem('buspoc-route-v1:'+key(route))||'null');if(cached)data=cached;}catch{}
      const override=overrides.get(key(route)),od=JSON.stringify([settings.origin,settings.destination]);
      const segment=override?.od===od&&override.direction===direction?override:data?makeSegment(data,route,settings,pins,direction):null;
      if(segment?.line.length)segments.push({...segment,route});else missing.push(route.name);
    }
    const lines={type:'FeatureCollection',features:segments.map((s,i)=>({type:'Feature',properties:{color:colorOf(s.route),name:s.route.name,offset:(i-(segments.length-1)/2)*8},geometry:{type:'LineString',coordinates:s.line}}))};
    if(!map.getSource('route-overlays')){
      map.addSource('route-overlays',{type:'geojson',data:lines});
      map.addLayer({id:'route-overlays-border',type:'line',slot:'top',source:'route-overlays',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#fff','line-width':7,'line-offset':['get','offset']}});
      map.addLayer({id:'route-overlays-color',type:'line',slot:'top',source:'route-overlays',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['get','color'],'line-width':4.5,'line-offset':['get','offset'],'line-emissive-strength':1}});
      map.addLayer({id:'route-overlays-names',type:'symbol',slot:'top',source:'route-overlays',layout:{'symbol-placement':'line','symbol-spacing':250,'text-field':['get','name'],'text-size':13},paint:{'text-color':['get','color'],'text-halo-color':'#fff','text-halo-width':2}});
    }else map.getSource('route-overlays').setData(lines);
    flags.forEach(m=>m.remove());flags=[];
    // Group shared stops to prevent a pile of labels at the same pole.
    const groups=new Map();for(const s of segments)for(const [stop,label]of [[s.stops[0],'上車'],[s.stops.at(-1),'下車']]){const p=stopPoint(stop),id=label+':'+stop.StopName.Zh_tw+':'+p.lat.toFixed(3)+':'+p.lon.toFixed(3);if(!groups.has(id))groups.set(id,{p,label,name:stop.StopName.Zh_tw,routes:[]});groups.get(id).routes.push(s.route);}
    for(const g of groups.values()){const el=document.createElement('div');el.className='stop-flag grouped';el.style.setProperty('--route',colorOf(g.routes[0]));const title=document.createElement('div');title.textContent=g.label+' · '+g.name;el.append(title);const badges=document.createElement('div');for(const r of g.routes){const b=document.createElement('span');b.textContent=r.name;b.style.background=colorOf(r);badges.append(b);}el.append(badges);flags.push(new mapboxgl.Marker({element:el,anchor:'bottom',offset:[0,-12]}).setLngLat([g.p.lon,g.p.lat]).addTo(map));}
    document.querySelector('#overlay-status').textContent=segments.length?`顯示 ${segments.map(s=>s.route.name).join('／')} · ${direction===0?'去程':'返程'}。色線平行錯開以便辨識，不代表車道。${missing.length?' 缺少可用區段：'+missing.join('、'):''}`:enabled.length?'未取得所選路線的可用區段，請載入或更新路線資料。':'未選擇路線。';
  }
  Promise.all([fetch('./default-routes.json').then(r=>r.json()),fetch('./commute-stops.json').then(r=>r.json())]).then(([d,p])=>{defaults=d;pins=p;render();}).catch(()=>{document.querySelector('#overlay-status').textContent='預設路線載入失敗，請重新整理。';});
  return {render,cache:(route)=>defaults[key(route)],setSegment(route,segment){overrides.set(key(route),{...segment,od:JSON.stringify([getSettings().origin,getSettings().destination])});render();},fit(){const m=getMap();if(m&&segments.length)m.fitBounds(segments.flatMap(s=>s.line).reduce((b,p)=>b.extend(p),new mapboxgl.LngLatBounds()),{padding:90,maxZoom:16,pitch:55});}};
}
