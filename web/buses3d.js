// Georeferenced, lightweight bus geometry. No external model/texture downloads.
export async function createBusLayer(map,onError){
  const T=await import('https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js');
  let scene,camera,renderer,anchor,models=new Map();
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
  function dispose(g){g.traverse(o=>{o.geometry?.dispose();if(o.material)o.material.dispose();});}
  const layer={id:'bus-models',type:'custom',renderingMode:'3d',
    onAdd(m,gl){camera=new T.Camera();scene=new T.Scene();scene.add(new T.HemisphereLight(0xdcecff,0x526178,2.5));const light=new T.DirectionalLight(0xffffff,3);light.position.set(-80,-40,150);scene.add(light);renderer=new T.WebGLRenderer({canvas:m.getCanvas(),context:gl,antialias:true});renderer.autoClear=false;},
    render(gl,matrix){if(!anchor||!renderer)return;const s=anchor.meterInMercatorCoordinateUnits();camera.projectionMatrix=new T.Matrix4().fromArray(matrix).multiply(new T.Matrix4().makeTranslation(anchor.x,anchor.y,anchor.z).scale(new T.Vector3(s,-s,s)));renderer.resetState();renderer.render(scene,camera);},
    onRemove(){models.forEach(dispose);models.clear();renderer?.dispose();},
    update(list,origin,colorOf){if(!scene)return;anchor=mapboxgl.MercatorCoordinate.fromLngLat([origin.lon,origin.lat],0);const scale=anchor.meterInMercatorCoordinateUnits();const wanted=new Set(list.map(v=>v.id));for(const [id,g]of models)if(!wanted.has(id)){scene.remove(g);dispose(g);models.delete(id);}list.forEach((v,i)=>{let g=models.get(v.id);if(!g){g=bus(colorOf(v));models.set(v.id,g);scene.add(g);}const p=mapboxgl.MercatorCoordinate.fromLngLat([v.lon,v.lat]);g.position.set((p.x-anchor.x)/scale,-(p.y-anchor.y)/scale,.4);g.rotation.z=-(v.bearing||0)*Math.PI/180;g.scale.setScalar(i<3?2.7:1.8);g.userData.halo.visible=i<3;});map.triggerRepaint();}
  };
  try{map.addLayer(layer);}catch(e){onError();throw e;}return layer;
}
