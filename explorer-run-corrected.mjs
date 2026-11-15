// WT corrected running animation, extracted from the fifth clip of the user's
// Untitled.glb. Original model meshes and idle animations are left untouched.
// RUN1: 65 Mixamo bone names and three tracks each, with shared 2/28-key
// timelines. Source float values are encoded as float16 (high precision for
// rotations), zlib-deflated for fast loading on GitHub Pages.
function readHalf(bits){
 const sign=(bits&0x8000)?-1:1,exponent=(bits>>>10)&31,mantissa=bits&1023;
 if(exponent===0)return sign*mantissa*Math.pow(2,-24);
 if(exponent===31)return mantissa?NaN:sign*Infinity;
 return sign*Math.pow(2,exponent-15)*(1+mantissa/1024);
}
const canonical=name=>String(name||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const PROPERTIES=['position','quaternion','scale'];
const COMPONENTS=[3,4,3];
export async function loadCorrectedExplorerRun(THREE,gltf,url='./assets/animations/explorer-run-corrected.b64'){
 if(typeof DecompressionStream!=='function')throw Error('El navegador no soporta la descompresión de la animación');
 const response=await fetch(url);
 if(!response.ok)throw Error('Animación corregida no disponible (HTTP '+response.status+')');
 const encoded=(await response.text()).trim();
 if(encoded.length<5000||encoded.length>100000||!/^[a-zA-Z0-9+/=]+$/.test(encoded))
  throw Error('Contenido de animación inválido');
 const zip=Uint8Array.from(atob(encoded),v=>v.charCodeAt(0));
 const bytes=new Uint8Array(await new Response(new Blob([zip]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
 const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 let pos=0;
 const read8=()=>dv.getUint8(pos++);
 const read16=()=>{const x=dv.getUint16(pos,true);pos+=2;return x};
 const floatArray=count=>{
  const values=new Float32Array(count);
  for(let i=0;i<count;i++)values[i]=readHalf(read16());
  return values;
 };
 const header=String.fromCharCode(read8(),read8(),read8(),read8());
 if(header!=='RUN1')throw Error('Formato de carrera incompatible');
 const bones=read16();
 if(bones!==65)throw Error('Número inesperado de huesos en la animación: '+bones);
 const time2=floatArray(2),time28=floatArray(28);
 // Match ORIGINAL GLTFLoader track names rather than relying on the
 // punctuation of Mixamo node names: GLTFLoader may sanitize ':'.
 const original=gltf.animations?.[4]||gltf.animations?.[0];
 if(!original?.tracks?.length)throw Error('El explorador original no contiene pistas');
 const names=new Map();
 for(const t of original.tracks){
  const dot=t.name.lastIndexOf('.');if(dot<=0)continue;
  const node=t.name.slice(0,dot),property=t.name.slice(dot+1);
  names.set(canonical(node)+'|'+property,t.name);
 }
 const paths=[THREE.VectorKeyframeTrack,THREE.QuaternionKeyframeTrack,THREE.VectorKeyframeTrack];
 const tracks=[];
 for(let i=0;i<bones;i++){
  const len=read8();
  if(len<1||len>95)throw Error('Nombre de hueso inválido');
  let short='';
  for(let k=0;k<len;k++)short+=String.fromCharCode(read8());
  const fullName='mixamorig:'+short;
  for(let axis=0;axis<3;axis++){
   const count=read8();
   if(count!==2&&count!==28)throw Error('Cantidad de claves inválida para '+fullName);
   const values=floatArray(count*COMPONENTS[axis]);
   if(axis===1){
    for(let j=0;j<values.length;j+=4){
     const norm=Math.hypot(values[j],values[j+1],values[j+2],values[j+3]);
     if(norm>1e-7)for(let n=0;n<4;n++)values[j+n]/=norm;
    }
   }
   const property=PROPERTIES[axis];
   const trackName=names.get(canonical(fullName)+'|'+property);
   if(trackName){
    const ctor=paths[axis];
    tracks.push(new ctor(trackName,count===28?time28:time2,values));
   }
  }
 }
 if(pos!==bytes.byteLength)throw Error('Datos sobrantes en la carrera corregida');
 if(tracks.length<50)throw Error('Los huesos de la nueva animación no coinciden con los del Explorador ('+tracks.length+'/195)');
 const clip=new THREE.AnimationClip('Explorador WT · Correr corregido',-1,tracks);
 if(!(clip.duration>.5&&clip.duration<3))throw Error('Duración inesperada en la nueva carrera');
 return clip;
}
