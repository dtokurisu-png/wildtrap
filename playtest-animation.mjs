// Keep animation locomotion in-place by removing horizontal movement
// from the skeleton's Hips / root translation tracks. Preserve vertical bounce,
// all rotations, limb motion and the source GLB.
export function inPlaceClip(clip){
 const copy=clip.clone();
 let corrected=0;
 for(const track of copy.tracks){
  if(!/\.position$/.test(track.name)||!/hips|pelvis|root|armature/i.test(track.name))continue;
  if(track.getValueSize()!==3||track.values.length<3)continue;
  // Keep initial local X/Z as the fixed origin, including the original pose.
  const x=track.values[0],z=track.values[2];
  for(let i=0;i<track.values.length;i+=3){
   track.values[i]=x;
   track.values[i+2]=z;
  }
  corrected++;
 }
 copy.name=clip.name+' [WT InPlace]';
 return {clip:copy,corrected};
}
