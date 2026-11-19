// Global hand-painted art: WHITE is transparent, DARK pigment is visible.
// Keep the user's requested 35% transparency (= 65% layer opacity).
// Preserve the original 10K PNG; use the optimized 4K WebP at runtime.
export const HANDPAINT_SOURCE='./assets/terrain/texturas/terreno_handpaint_10K.png';
export const HANDPAINT_GPU_SOURCE='./assets/terrain/texturas/terreno_handpaint_4K.webp';
export const HANDPAINT_OPACITY=0.65;
export const HANDPAINT_GPU_MAX_SIZE=4096;
export const HANDPAINT_EDGE_FADE=0.06;  // 6% fade at each of all four edges.
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
export function darkOnlyRGB(base,paint,opacity=HANDPAINT_OPACITY){
 const luma=paint[0]*0.2126+paint[1]*0.7152+paint[2]*0.0722;
 const darkness=smoothstep(0.05,0.77,1-luma);
 const strength=clamp01(opacity)*darkness;
 // Multiplication: pure WHITE is exactly neutral; BLACK darkens by 65%.
 return base.map((channel,i)=>channel*(1-strength*(1-clamp01(paint[i]))));
}
