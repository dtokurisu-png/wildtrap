// Keep the Explorer shadow map at full resolution while avoiding needless
// 1024x1024 shadow-depth draws on every frame of the render loop.
// Shadow cadence changes ONLY the animated Explorer, not the static world sun.
export const HERO_SHADOW_MOVING_INTERVAL_MS=32;
export const HERO_SHADOW_IDLE_INTERVAL_MS=66;
export function explorerShadowDue(now,lastUpdate,moving=false){
 return now-lastUpdate >= (moving?HERO_SHADOW_MOVING_INTERVAL_MS:HERO_SHADOW_IDLE_INTERVAL_MS);
}
