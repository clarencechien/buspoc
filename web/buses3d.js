// Georeferenced, lightweight bus geometry. No external model/texture downloads.
export async function createBusLayer(map,onError){
  const T=await import('https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js');
  let scene,camera,renderer,anchor,models=new Map(),landmarks=[];
  function bus(color){
    const g=new T.Group();
    const paint=new T.MeshStandardMaterial({color,roughness:.32,metalness:.25});
    const glass=new T.MeshStandardMaterial({color:0x12354c,roughness:.12,metalness:.65});
    const white=new T.MeshStandardMaterial({color:0xeaf4ff,roughness:.5});
    const rubber=new T.MeshStandardMaterial({color:0x131e2b,roughness:.9});
    const lamp=new T.MeshStandardMaterial({color:0xffefb5,emissive:0xffd977,emissiveIntensity:2});
    function box(w,l,h,x,y,z,m){const o=new T.Mesh(new T.BoxGeometry(w,l,h),m);o.position.set(x,y,z);g.add(o);return o;}
    box(2.6,11.8,2.2,0,0,1.6,paint);box(2.58,10.9,.7,0,0,2.6,glass);
    box(2.7,11.8,.18,0,0,3,white);box(1.7,2.1,.35,0,-1,3.25,white);
    // Window pillars, windshield, doors, bumpers and front/rear lights.
    for(const y of [-4.5,-2.7,-.9,.9,2.7,4.5])box(2.62,.12,.85,0,y,2.55,paint);
    box(2.2,.05,1,0,5.92,2.15,glass);box(1.3,.08,.35,0,5.97,2.85,lamp);
    for(const x of [-.9,.9]){box(.45,.09,.2,x,5.96,1,lamp);box(.4,.09,.2,x,-5.96,1,new T.MeshStandardMaterial({color:0xff374d,emissive:0xb0192e}));}
    for(const y of [-3.6,3.7])for(const x of [-1.3,1.3]){const wheel=new T.Mesh(new T.CylinderGeometry(.53,.53,.3,12),rubber);wheel.rotation.z=Math.PI/2;wheel.position.set(x,y,.6);g.add(wheel);}
    const halo=new T.Mesh(new T.RingGeometry(6.8,7.5,48),new T.MeshBasicMaterial({color,transparent:true,opacity:.7,side:T.DoubleSide,depthWrite:false}));halo.position.z=.08;g.add(halo);g.userData.halo=halo;
    return g;
  }
  function landmark(color,label,dome){
    const g=new T.Group();
    const stone=new T.MeshStandardMaterial({color:0xf1f0e8,roughness:.7,depthTest:false});
    const metal=new T.MeshStandardMaterial({color,metalness:.45,roughness:.3,depthTest:false});
    const glass=new T.MeshStandardMaterial({color:0x193d5a,metalness:.7,roughness:.12,depthTest:false});
    const mesh=(geometry,material,x=0,y=0,z=0)=>{const o=new T.Mesh(geometry,material);o.position.set(x,y,z);o.renderOrder=100;g.add(o);return o;};
    for(let i=0;i<3;i++)mesh(new T.BoxGeometry(22-i*2,17-i*2,1),stone,0,0,.5+i);
    mesh(new T.BoxGeometry(16,10,8),glass,0,1,7);
    for(const x of [-7,-3.5,3.5,7]){const col=mesh(new T.CylinderGeometry(.65,.85,8,12),stone,x,-5,7);col.rotation.x=Math.PI/2;}
    mesh(new T.BoxGeometry(20,14,1.3),stone,0,0,11.5);
    if(dome){const roof=mesh(new T.SphereGeometry(8,24,12,0,Math.PI*2,0,Math.PI/2),metal,0,0,12);roof.rotation.x=Math.PI/2;}
    else{const roof=mesh(new T.ConeGeometry(14,7,4),metal,0,0,15);roof.rotation.x=Math.PI/2;roof.rotation.z=Math.PI/4;}
    const arch=mesh(new T.TorusGeometry(2.2,.4,8,24,Math.PI),stone,0,-5.2,6);arch.rotation.x=Math.PI/2;
    const canvas=document.createElement('canvas');canvas.width=256;canvas.height=96;const ctx=canvas.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,256,96);ctx.fillStyle='white';ctx.font='bold 52px sans-serif';ctx.textAlign='center';ctx.fillText(label,128,68);
    const texture=new T.CanvasTexture(canvas);const sign=new T.Sprite(new T.SpriteMaterial({map:texture,depthTest:false}));sign.position.set(0,-1,26);sign.scale.set(18,6.75,1);sign.renderOrder=110;g.add(sign);
    const ring=mesh(new T.RingGeometry(14,15,48),new T.MeshBasicMaterial({color,transparent:true,opacity:.65,side:T.DoubleSide,depthTest:false}),0,0,.1);
    g.userData.ring=ring;return g;
  }
  function dispose(g){g.traverse(o=>{o.geometry?.dispose();if(o.material){o.material.map?.dispose();o.material.dispose();}});}
  const layer={id:'bus-models',type:'custom',renderingMode:'3d',
    onAdd(m,gl){camera=new T.Camera();scene=new T.Scene();scene.add(new T.HemisphereLight(0xdcecff,0x526178,2.5));const light=new T.DirectionalLight(0xffffff,3);light.position.set(-80,-40,150);scene.add(light);renderer=new T.WebGLRenderer({canvas:m.getCanvas(),context:gl,antialias:true});renderer.autoClear=false;},
    render(gl,matrix){if(!anchor||!renderer)return;const s=anchor.meterInMercatorCoordinateUnits();camera.projectionMatrix=new T.Matrix4().fromArray(matrix).multiply(new T.Matrix4().makeTranslation(anchor.x,anchor.y,anchor.z).scale(new T.Vector3(s,-s,s)));renderer.resetState();renderer.render(scene,camera);},
    onRemove(){models.forEach(dispose);models.clear();landmarks.forEach(dispose);landmarks=[];renderer?.dispose();},
    update(list,origin,colorOf,places){if(!scene)return;anchor=mapboxgl.MercatorCoordinate.fromLngLat([origin.lon,origin.lat],0);const scale=anchor.meterInMercatorCoordinateUnits();if(places){if(!landmarks.length){landmarks=[landmark('#176ad5','A 出發',true),landmark('#128c7d','B 抵達',false)];landmarks.forEach(g=>scene.add(g));}places.forEach((place,i)=>{const p=mapboxgl.MercatorCoordinate.fromLngLat([place.lon,place.lat]);landmarks[i].position.set((p.x-anchor.x)/scale,-(p.y-anchor.y)/scale,1);});}const wanted=new Set(list.map(v=>v.id));for(const [id,g]of models)if(!wanted.has(id)){scene.remove(g);dispose(g);models.delete(id);}list.forEach((v,i)=>{let g=models.get(v.id);if(!g){g=bus(colorOf(v));models.set(v.id,g);scene.add(g);}const p=mapboxgl.MercatorCoordinate.fromLngLat([v.lon,v.lat]);g.position.set((p.x-anchor.x)/scale,-(p.y-anchor.y)/scale,.4);g.rotation.z=-(v.bearing||0)*Math.PI/180;g.scale.setScalar(i<3?2.7:1.8);g.userData.halo.visible=i<3;});map.triggerRepaint();}
  };
  try{map.addLayer(layer);}catch(e){onError();throw e;}return layer;
}
