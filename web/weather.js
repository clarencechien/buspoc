const descriptions={0:'晴',1:'晴時多雲',2:'局部多雲',3:'陰天',45:'霧',48:'霧',51:'毛毛雨',53:'毛毛雨',55:'毛毛雨',61:'小雨',63:'雨',65:'大雨',80:'陣雨',81:'陣雨',82:'強陣雨',95:'雷雨',96:'雷雨伴冰雹',99:'雷雨伴冰雹'};
export function setupWeather(getOrigin){let controller;
  const el=document.querySelector('#weather-status');
  async function update(){controller?.abort();const c=new AbortController();controller=c;const p=getOrigin();el.textContent='查詢出發地天氣…';const timer=setTimeout(()=>c.abort(),12000);
    try{const url=new URL('https://api.open-meteo.com/v1/forecast');url.search=new URLSearchParams({latitude:p.lat,longitude:p.lon,current:'temperature_2m,apparent_temperature,weather_code,precipitation',timezone:'Asia/Taipei'});const r=await fetch(url,{signal:c.signal});if(!r.ok)throw Error();const d=await r.json();if(controller!==c)return;const w=d.current;if(!Number.isFinite(w?.temperature_2m))throw Error();el.textContent=`${p.name} · ${descriptions[w.weather_code]||'其他天氣'} ${w.temperature_2m}°C · 體感 ${w.apparent_temperature}°C · 降水 ${w.precipitation} mm｜${w.time.replace('T',' ')}（台北時間；模式估計）`;
    }catch{if(controller===c)el.textContent='天氣暫時無法取得，可按更新重試。';}finally{clearTimeout(timer);}
  }document.querySelector('#weather-refresh').onclick=update;return {update};
}
