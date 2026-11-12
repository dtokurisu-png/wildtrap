// Camera metadata belongs to the editor, not the world terrain or game state.
// Safe/recovery/normal drafts keep separate keys and older JSON remains readable.
export const DEFAULT_3D_CAMERA=Object.freeze({
 version:1,position:[300,330,350],target:[0,0,0],up:[0,1,0],
 viewSpan:720,zoom:1,enableRotate:true,label:'Vista 3D'
});
const vec=value=>Array.isArray(value)&&value.length===3&&
 value.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=100000)?
 value.slice():null;
const finite=(n,min,max)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;
const LABELS=new Set(['Vista 3D','Vista cenital','Vista superior Y','Vista lateral X','Vista frontal Z']);
export function normalizeEditorCameraState(input){
 if(!input||typeof input!=='object'||Array.isArray(input))return null;
 const position=vec(input.position),target=vec(input.target),up=vec(input.up);
 if(!position||!target||!up)return null;
 if(Math.hypot(...up)<.5||Math.hypot(...position.map((x,i)=>x-target[i]))<.5)return null;
 if(!finite(input.viewSpan,80,1400)||!finite(input.zoom,.1,20))return null;
 if(typeof input.enableRotate!=='boolean')return null;
 return {
  version:1,position,target,up,viewSpan:input.viewSpan,zoom:input.zoom,
  enableRotate:input.enableRotate,
  label:LABELS.has(input.label)?input.label:'Vista 3D'
 };
}
