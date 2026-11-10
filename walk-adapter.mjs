import * as THREE from 'three';
import {clone as cloneSkinned,retargetClip} from 'three/addons/utils/SkeletonUtils.js';

// Exact same retargeting recipe used in R.O.K. arena-25d.html's
// adaptAnimationFBX, adapted as an independent module for WILDTRAP.
const boneKey=name=>String(name).replace(/^.*?mixamorig[:_]?/i,'').replace(/[^a-z0-9]/gi,'').toLowerCase();
function findSkeleton(root){
 let sk=null;
 root.traverse(o=>{if(o.isSkinnedMesh&&o.skeleton&&(!sk||o.skeleton.bones.length>sk.bones.length))sk=o.skeleton});
 if(sk)return sk;
 const bones=[];root.traverse(o=>{if(o.isBone)bones.push(o)});
 return bones.length>=20?new THREE.Skeleton(bones):null;
}
export function adaptSummonWalk(source,sourceClip,targetModel){
 const copy=cloneSkinned(targetModel);
 const src=findSkeleton(source),dst=findSkeleton(copy);
 if(!src||!dst)throw Error('La animación de las invocaciones requiere esqueletos Mixamo válidos');
 src.pose();dst.pose();source.updateMatrixWorld(true);copy.updateMatrixWorld(true);
 const srcMap=new Map(src.bones.map(b=>[boneKey(b.name),b]));
 const names={},localOffsets={};
 let matched=0;
 for(const b of dst.bones){
  const original=srcMap.get(boneKey(b.name));if(!original)continue;
  names[b.name]=original.name;
  const sr=original.getWorldQuaternion(new THREE.Quaternion());
  const dr=b.getWorldQuaternion(new THREE.Quaternion());
  localOffsets[b.name]=new THREE.Matrix4().makeRotationFromQuaternion(sr.invert().multiply(dr));
  matched++;
 }
 if(matched<20)throw Error('Los rigs solo comparten '+matched+' huesos');
 source.skeleton=src;copy.skeleton=dst;
 let baked;
 try{
  baked=retargetClip(copy,source,sourceClip,{
   fps:30,names,localOffsets,preserveBonePositions:true,hip:'__NO_ROOT_TRANSLATION__'
  });
 }finally{delete source.skeleton;delete copy.skeleton}
 const tracks=baked.tracks.filter(t=>/^\.bones\[(.+)\]\.quaternion$/.test(t.name)).map(t=>{
  const out=t.clone();
  out.name=t.name.replace(/^\.bones\[(.+)\]\.quaternion$/,'$1.quaternion');
  return out;
 });
 if(tracks.length<15)throw Error('El retarget no produjo suficientes pistas del esqueleto ('+tracks.length+')');
 const dstHips=dst.bones.find(b=>boneKey(b.name)==='hips');
 const srcHips=srcMap.get('hips');
 const srcFoot=srcMap.get('leftfoot')||srcMap.get('rightfoot');
 const dstFoot=dst.bones.find(b=>boneKey(b.name)==='leftfoot')||dst.bones.find(b=>boneKey(b.name)==='rightfoot');
 if(dstHips&&srcHips&&srcFoot&&dstFoot){
  const wp=b=>b.getWorldPosition(new THREE.Vector3());
  const ratio=wp(dstHips).distanceTo(wp(dstFoot))/Math.max(.001,wp(srcHips).distanceTo(wp(srcFoot)));
  const scale=THREE.MathUtils.clamp(ratio,.0001,100),rest=dstHips.position.clone();
  src.pose();source.updateMatrixWorld(true);
  const temp=new THREE.AnimationMixer(source);
  temp.clipAction(sourceClip).play();
  const frames=Math.min(180,Math.max(2,Math.ceil(sourceClip.duration*30)+1));
  const times=new Float32Array(frames),values=new Float32Array(frames*3);
  let startY=null;
  for(let i=0;i<frames;i++){
   const time=Math.max(0,Math.min(sourceClip.duration-.0001,sourceClip.duration*i/(frames-1)));
   temp.setTime(time);source.updateMatrixWorld(true);
   const y=srcHips.getWorldPosition(new THREE.Vector3()).y;
   if(startY===null)startY=y;
   times[i]=time;values[i*3]=rest.x;
   values[i*3+1]=rest.y+THREE.MathUtils.clamp((y-startY)*scale,-1.6,1.6);
   values[i*3+2]=rest.z;
  }
  tracks.push(new THREE.VectorKeyframeTrack(dstHips.name+'.position',times,values));
  temp.stopAllAction();
 }
 const clip=new THREE.AnimationClip('ROK_Semillera_Catwalk_Walking_40',-1,tracks);
 clip.optimize();
 return clip;
}
