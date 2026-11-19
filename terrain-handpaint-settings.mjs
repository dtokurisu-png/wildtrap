// One worldwide, non-tiling hand-painted enhancement, applied in the
// existing biome material fragment shaders (no fullscreen postprocessing).
// User requested Photoshop Overlay / Superposición at ~50% opacity.
export const HANDPAINT_SOURCE='./assets/terrain/texturas/terreno_handpaint_10K.png';
export const HANDPAINT_GPU_SOURCE='./assets/terrain/texturas/terreno_handpaint_4K.webp';
export const HANDPAINT_OPACITY=0.50;
export const HANDPAINT_CONTRAST=0.45; // Compress grayscale brush contrast to avoid black staining.
export const HANDPAINT_GPU_MAX_SIZE=4096;
export const HANDPAINT_EDGE_FADE=0.06;
export const HANDPAINT_SLOPE_START=0.70;
export const HANDPAINT_SLOPE_END=0.86;
const clamp01=x=>Math.max(0,Math.min(1,x));
export function smoothstep(a,b,x){
 const t=clamp01((x-a)/(b-a));
 return t*t*(3-2*t);
}
export function handpaintEdgeFade(u,v){
 return smoothstep(0,HANDPAINT_EDGE_FADE,Math.min(u,1-u,v,1-v));
}
export function handpaintSlopeFade(upness){
 return smoothstep(HANDPAINT_SLOPE_START,HANDPAINT_SLOPE_END,upness);
}
export function overlayChannel(base,paint){
 return base<=.5?2*base*paint:1-2*(1-base)*(1-paint);
}
export function softOverlayRGB(base,paint,opacity=HANDPAINT_OPACITY){
 const luma=paint[0]*.2126+paint[1]*.7152+paint[2]*.0722;
 // White/near-white drawing background is neutral, dark strokes carry pigment.
 const darkness=1-smoothstep(.70,.99,luma);
 const out=base.map((c,i)=>{
  const attenuated=.5+(paint[i]-.5)*HANDPAINT_CONTRAST;
  return c+(overlayChannel(c,attenuated)-c)*clamp01(opacity)*darkness;
 });
 return out.map(clamp01);
}
