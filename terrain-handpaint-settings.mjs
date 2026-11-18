// Shared, dependency-free Hard Light settings and reference math.
// Photoshop "35% transparency" means 65% layer opacity.
export const HANDPAINT_SOURCE='./assets/terrain/texturas/terreno_handpaint_10K.png';
export const HANDPAINT_GPU_SOURCE='./assets/terrain/texturas/terreno_handpaint_4K.webp';
export const HANDPAINT_OPACITY=0.65;
export const HANDPAINT_GPU_MAX_SIZE=4096;
export function hardLightChannel(base,source){
 return source<=0.5?2*base*source:1-2*(1-base)*(1-source);
}
export function hardLightRGB(base,paint,opacity=HANDPAINT_OPACITY){
 const weight=Math.max(0,Math.min(1,opacity));
 return base.map((channel,i)=>channel*(1-weight)+hardLightChannel(channel,paint[i])*weight);
}
