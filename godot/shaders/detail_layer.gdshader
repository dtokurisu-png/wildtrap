shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_never;

// Separate transparent passes: the base ground stays intact if a detail
// layer is absent. Same seeded 3x3-neighbor decal layout as Three.js.
uniform sampler2D detail_texture : source_color, filter_linear_mipmap;
uniform sampler2D region_mask : filter_linear;
uniform float repeats=200.0;
uniform float variation_seed=1.0;
uniform float layer_number=1.0;
uniform float intensity : hint_range(0.0,1.0)=0.5;
uniform float biome_contrast=1.0;
uniform float biome_saturation=1.0;
uniform float region_feather_world=5.0;

varying vec3 wt_pos;
varying vec3 wt_normal;

void vertex(){
 wt_pos=(MODEL_MATRIX*vec4(VERTEX,1.0)).xyz;
 wt_normal=normalize(MODEL_NORMAL_MATRIX*NORMAL);
 // 4cm surface offset avoids z-fighting against the ground base.
 VERTEX+=NORMAL*(0.04+layer_number*0.015);
}
float rand2(vec2 p){
 return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);
}
vec3 adjust_color(vec3 color){
 vec3 with_contrast=clamp((color-vec3(0.5))*biome_contrast+vec3(0.5),vec3(0.0),vec3(1.0));
 float gray=dot(with_contrast,vec3(0.2126,0.7152,0.0722));
 return clamp(mix(vec3(gray),with_contrast,biome_saturation),vec3(0.0),vec3(1.0));
}
void fragment(){
 vec2 mask_uv=vec2(wt_pos.x/630.0+0.5,0.5-wt_pos.z/630.0);
 float radius=region_feather_world/630.0;
 float inside=texture(region_mask,mask_uv).r;
 if(radius>0.000001){
   inside=inside*0.5;
   inside+=0.125*texture(region_mask,clamp(mask_uv+vec2(radius,0.0),vec2(0.0),vec2(1.0))).r;
   inside+=0.125*texture(region_mask,clamp(mask_uv-vec2(radius,0.0),vec2(0.0),vec2(1.0))).r;
   inside+=0.125*texture(region_mask,clamp(mask_uv+vec2(0.0,radius),vec2(0.0),vec2(1.0))).r;
   inside+=0.125*texture(region_mask,clamp(mask_uv-vec2(0.0,radius),vec2(0.0),vec2(1.0))).r;
 }
 float flatness=smoothstep(0.65,0.85,abs(wt_normal.y));
 if(inside<0.01||flatness<0.01||intensity<=0.0)discard;
 float columns=max(1.0,floor(repeats+0.5));
 vec2 unit=(wt_pos.xz+vec2(315.0))/630.0*columns;
 vec2 origin=floor(unit);
 float cell_size=630.0/columns;
 float extent=630.0/max(repeats,0.25);
 vec3 premultiplied=vec3(0.0);
 float combined_alpha=0.0;
 for(int dy=-1;dy<=1;dy++){
  for(int dx=-1;dx<=1;dx++){
   vec2 cell=origin+vec2(float(dx),float(dy));
   if(cell.x<0.0||cell.y<0.0||cell.x>=columns||cell.y>=columns)continue;
   vec2 id=cell+vec2(variation_seed*0.117+layer_number*17.3,variation_seed*0.071+layer_number*31.9);
   if(rand2(id+vec2(43.0))>0.60)continue;
   vec2 jitter=vec2(rand2(id+vec2(12.0)),rand2(id+vec2(25.0)));
   vec2 center=vec2(-315.0)+(cell+vec2(0.12)+0.76*jitter)*cell_size;
   vec2 uv=(wt_pos.xz-center)/extent+vec2(0.5);
   if(uv.x<=0.0||uv.y<=0.0||uv.x>=1.0||uv.y>=1.0)continue;
   vec2 normalized_distance=abs(uv-vec2(0.5))*2.0;
   vec2 fade_axis=vec2(1.0)-smoothstep(vec2(0.5),vec2(1.0),normalized_distance);
   float feather=fade_axis.x*fade_axis.y;
   if(feather<0.002)continue;
   vec4 sample_color=texture(detail_texture,uv);
   float patch_opacity=0.5+0.3*rand2(id+vec2(94.0));
   float alpha=inside*flatness*sample_color.a*feather*patch_opacity*intensity;
   if(alpha<0.002)continue;
   premultiplied=sample_color.rgb*alpha+premultiplied*(1.0-alpha);
   combined_alpha=alpha+combined_alpha*(1.0-alpha);
  }
 }
 if(combined_alpha<0.002)discard;
 ALBEDO=adjust_color(premultiplied/max(combined_alpha,0.0001));
 ALPHA=clamp(combined_alpha,0.0,1.0);
}
