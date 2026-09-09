import {distance,validPoint} from './core.js';
export const palette={'57':'#176ad5','706':'#8250dc','243':'#128c7d','214直':'#d54679','橘3':'#ed8518'};
export function parseLine(wkt){
  const m=/^LINESTRING\s*\(([^()]+)\)$/i.exec(wkt?.trim()||'');if(!m)return [];
  const pts=m[1].split(',').map(s=>s.trim().split(/\s+/).map(Number)).map(p=>[p[0],p[1]]);
  return pts.length>1&&pts.every(p=>validPoint({lon:p[0],lat:p[1]}))?pts:[];
}
export function project(point,line){let best={gap:Infinity,along:0,index:0,t:0},along=0;const cos=Math.cos(point.lat*Math.PI/180);
  for(let i=0;i<line.length-1;i++){const a=line[i],b=line[i+1],dx=(b[0]-a[0])*cos,dy=b[1]-a[1],px=(point.lon-a[0])*cos,py=point.lat-a[1];const t=Math.max(0,Math.min(1,(px*dx+py*dy)/(dx*dx+dy*dy||1)));const q={lon:a[0]+(b[0]-a[0])*t,lat:a[1]+(b[1]-a[1])*t};const length=distance({lon:a[0],lat:a[1]},{lon:b[0],lat:b[1]}),gap=distance(point,q);if(gap<best.gap)best={gap,along:along+t*length,index:i,t,coord:[q.lon,q.lat]};along+=length;}return best;
}
export function clipLine(line,start,end){if(line.length<2)return [];const a=project(start,line),b=project(end,line);if(a.gap>150||b.gap>150||b.along<=a.along)return [];return [a.coord,...line.slice(a.index+1,b.index+1),b.coord];}
export function stopPoint(s){return {lat:s.StopPosition?.PositionLat,lon:s.StopPosition?.PositionLon};}
export function chooseStops(stops,origin,dest,pinned){
  if(pinned){const a=stops.findIndex(s=>s.StopUID===pinned.board),b=stops.findIndex(s=>s.StopUID===pinned.alight);if(a>=0&&b>a)return [a,b];}
  let best=Infinity,pair=null;for(let i=0;i<stops.length;i++)for(let j=i+1;j<stops.length;j++){const d=distance(origin,stopPoint(stops[i]))+distance(dest,stopPoint(stops[j]));if(d<best){best=d;pair=[i,j];}}return pair;
}
export function etaText(rows,stop,direction){const matched=rows.filter(r=>r.StopUID===stop.StopUID&&r.Direction===direction&&r.StopStatus===0&&Number.isFinite(r.EstimateTime)&&r.EstimateTime>=0);matched.sort((a,b)=>a.EstimateTime-b.EstimateTime);return matched.length?`官方預估：${matched[0].EstimateTime<60?'即將進站':Math.ceil(matched[0].EstimateTime/60)+' 分鐘'}${matched[0].PlateNumb?' · '+matched[0].PlateNumb:''}`:'此站暫無可用到站預估';}
