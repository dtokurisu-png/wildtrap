shader_type spatial;
render_mode cull_disabled, diffuse_lambert, specular_disabled;

// A preliminary native material. Uses real saved biome ground/cliff textures,
// repeats and zone polygons. The Three.js detail and handpaint blending modes
// will be ported separately and must not be called visually identical yet.
uniform sampler2D mask_forest : filter_linear;
uniform sampler2D mask_desert : filter_linear;
uniform sampler2D mask_plains : filter_linear;
uniform sampler2D mask_swamp : filter_linear;
uniform sampler2D mask_mountain : filter_linear;

uniform sampler2D ground_forest : source_color, repeat_enable, filter_linear_mipmap;
uniform sampler2D ground_desert : source_color, repeat_enable, filter_linear_mipmap;
uniform sampler2D ground_plains : source_color, repeat_enable, filter_linear_mipmap;
uniform sampler2D ground_swamp : source_color, repeat_enable, filter_linear_mipmap;
uniform sampler2D ground_mountain : source_color, repeat_enable, filter_linear_mipmap;

uniform sampler2D cliff_forest : source_color, repeat_enable, filter_linear_mipmap;
uniform sampler2D cliff_desert : source_color, repeat_enable, filter_linear_mipmap;
uniform sampler2D cliff_plains : source_color, repeat_enable, filter_linear_mipmap;
uniform sampler2D cliff_swamp : source_color, repeat_enable, filter_linear_mipmap;
uniform sampler2D cliff_mountain : source_color, repeat_enable, filter_linear_mipmap;

uniform float repeat_forest = 200.0;
uniform float repeat_desert = 300.0;
uniform float repeat_plains = 200.0;
uniform float repeat_swamp = 200.0;
uniform float repeat_mountain = 200.0;
uniform float cliff_repeat = 26.25;
uniform int selected_biome = -1;
uniform vec4 editor_tint : source_color = vec4(0.37, 0.68, 0.55, 1.0);
uniform float editor_tint_strength : hint_range(0.0,1.0) = 0.14;
uniform bool selected_zone_enabled = false;
uniform sampler2D selected_zone_mask : filter_linear;
uniform bool cliff_zones_enabled = false;
uniform sampler2D cliff_zones_mask : filter_linear;

varying vec3 wt_pos;
varying vec3 wt_normal;

void vertex() {
 wt_pos=(MODEL_MATRIX*vec4(VERTEX, 1.0)).xyz;
 wt_normal=normalize(MODEL_NORMAL_MATRIX*NORMAL);
}

void fragment() {
 vec2 muv=vec2(wt_pos.x/630.0+0.5,0.5-wt_pos.z/630.0);
 float mf=texture(mask_forest,muv).r, md=texture(mask_desert,muv).r;
 float mp=texture(mask_plains,muv).r, ms=texture(mask_swamp,muv).r;
 float mm=texture(mask_mountain,muv).r;
 float steep=1.0-smoothstep(0.35,0.85,abs(wt_normal.y));
 vec2 base_uv=wt_pos.xz/630.0;
 vec2 wall_uv=vec2(abs(wt_normal.x)>abs(wt_normal.z)?wt_pos.z:wt_pos.x, wt_pos.y)/630.0;
 vec3 accum=vec3(0.0);
 float total=mf+md+mp+ms+mm;
 if(mf>0.001){
   vec3 top=texture(ground_forest,base_uv*repeat_forest).rgb;
   vec3 wall=texture(cliff_forest,wall_uv*cliff_repeat).rgb;
   accum+=mix(top,wall,steep)*mf;
 }
 if(md>0.001){
   vec3 top=texture(ground_desert,base_uv*repeat_desert).rgb;
   vec3 wall=texture(cliff_desert,wall_uv*cliff_repeat).rgb;
   accum+=mix(top,wall,steep)*md;
 }
 if(mp>0.001){
   vec3 top=texture(ground_plains,base_uv*repeat_plains).rgb;
   vec3 wall=texture(cliff_plains,wall_uv*cliff_repeat).rgb;
   accum+=mix(top,wall,steep)*mp;
 }
 if(ms>0.001){
   vec3 top=texture(ground_swamp,base_uv*repeat_swamp).rgb;
   vec3 wall=texture(cliff_swamp,wall_uv*cliff_repeat).rgb;
   accum+=mix(top,wall,steep)*ms;
 }
 if(mm>0.001){
   vec3 top=texture(ground_mountain,base_uv*repeat_mountain).rgb;
   vec3 wall=texture(cliff_mountain,wall_uv*cliff_repeat).rgb;
   accum+=mix(top,wall,steep)*mm;
 }
 vec3 unassigned=vec3(0.30,0.40,0.34);
 ALBEDO=total>0.001?mix(unassigned,accum/max(total,0.001),clamp(total,0.0,1.0)):unassigned;
 float active = 0.0;
 if(selected_biome==0){active=mf;}
 else if(selected_biome==1){active=md;}
 else if(selected_biome==2){active=mp;}
 else if(selected_biome==3){active=ms;}
 else if(selected_biome==4){active=mm;}
 float highlight_strength=clamp(active,0.0,1.0)*editor_tint_strength;
 if(selected_zone_enabled){highlight_strength=max(highlight_strength,texture(selected_zone_mask,muv).r*0.19);}
 if(cliff_zones_enabled){highlight_strength=max(highlight_strength,texture(cliff_zones_mask,muv).r*0.10);}
 ALBEDO=mix(ALBEDO,editor_tint.rgb,clamp(highlight_strength,0.0,0.24));
 ROUGHNESS=1.0;
}
