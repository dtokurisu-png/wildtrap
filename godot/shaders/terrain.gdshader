shader_type spatial;
render_mode cull_disabled, diffuse_lambert, specular_disabled;

// WildTrap native terrain: 5 ground biomes, separate parent-biome cliff masks,
// and the original grayscale hand-painted underlay on ground only.
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

uniform sampler2D cliff_mask_forest : filter_linear;
uniform sampler2D cliff_mask_desert : filter_linear;
uniform sampler2D cliff_mask_plains : filter_linear;
uniform sampler2D cliff_mask_swamp : filter_linear;
uniform sampler2D cliff_mask_mountain : filter_linear;

uniform float repeat_forest = 200.0;
uniform float repeat_desert = 300.0;
uniform float repeat_plains = 200.0;
uniform float repeat_swamp = 200.0;
uniform float repeat_mountain = 200.0;
uniform float cliff_repeat_forest = 26.25;
uniform float cliff_repeat_desert = 26.25;
uniform float cliff_repeat_plains = 50.0;
uniform float cliff_repeat_swamp = 26.25;
uniform float cliff_repeat_mountain = 26.25;
uniform float cliff_intensity_forest = 1.0;
uniform float cliff_intensity_desert = 1.0;
uniform float cliff_intensity_plains = 0.85;
uniform float cliff_intensity_swamp = 1.0;
uniform float cliff_intensity_mountain = 1.0;
uniform float ground_opacity_forest = 1.0;
uniform float ground_opacity_desert = 1.0;
uniform float ground_opacity_plains = 1.0;
uniform float ground_opacity_swamp = 1.0;
uniform float ground_opacity_mountain = 1.0;
uniform float biome_contrast_forest = 1.0;
uniform float biome_contrast_desert = 1.0;
uniform float biome_contrast_plains = 1.0;
uniform float biome_contrast_swamp = 1.0;
uniform float biome_contrast_mountain = 1.0;
uniform float biome_saturation_forest = 1.0;
uniform float biome_saturation_desert = 1.0;
uniform float biome_saturation_plains = 1.0;
uniform float biome_saturation_swamp = 1.0;
uniform float biome_saturation_mountain = 1.0;

uniform sampler2D handpaint_texture : source_color, filter_linear_mipmap;
uniform bool handpaint_enabled = true;
uniform float handpaint_opacity : hint_range(0.0, 1.0) = 0.50;
uniform float handpaint_contrast : hint_range(0.0, 4.0) = 0.45;
uniform float handpaint_rotation_degrees = 180.0;
uniform int handpaint_blend_mode = 3;

uniform int selected_biome = -1;
uniform vec4 editor_tint : source_color = vec4(0.37, 0.68, 0.55, 1.0);
uniform float editor_tint_strength : hint_range(0.0,1.0) = 0.14;
uniform bool selected_zone_enabled = false;
uniform sampler2D selected_zone_mask : filter_linear;
uniform bool cliff_zones_enabled = false;
uniform sampler2D cliff_zones_mask : filter_linear;

varying vec3 wt_pos;
varying vec3 wt_normal;

void vertex(){
 wt_pos=(MODEL_MATRIX*vec4(VERTEX,1.0)).xyz;
 wt_normal=normalize(MODEL_NORMAL_MATRIX*NORMAL);
}

// Same Photoshop Overlay operation as the WebGL handpaint underlay.
vec3 overlay_rgb(vec3 bottom,vec3 top){
 vec3 multiply=2.0*bottom*top;
 vec3 screen=1.0-2.0*(1.0-bottom)*(1.0-top);
 return mix(multiply,screen,step(vec3(0.5),bottom));
}

vec3 blend_rgb(vec3 bottom, vec3 top, int mode){
 if(mode==0)return top;
 if(mode==1)return bottom*top;
 if(mode==2)return 1.0-(1.0-bottom)*(1.0-top);
 if(mode==3)return overlay_rgb(bottom,top);
 if(mode==4){
  vec3 low=bottom-(1.0-2.0*top)*bottom*(1.0-bottom);
  vec3 high=bottom+(2.0*top-1.0)*(sqrt(max(bottom,vec3(0.0)))-bottom);
  return mix(low,high,step(vec3(0.5),top));
 }
 if(mode==5)return overlay_rgb(top,bottom);
 float base_light=dot(bottom,vec3(0.2126,0.7152,0.0722));
 float top_light=dot(top,vec3(0.2126,0.7152,0.0722));
 if(mode==6)return clamp(top+vec3(base_light-top_light),vec3(0.0),vec3(1.0));
 return clamp(bottom+vec3(top_light-base_light),vec3(0.0),vec3(1.0));
}

vec3 color_adjust(vec3 rgb,float contrast,float saturation){
 vec3 adjusted=clamp((rgb-vec3(0.5))*contrast+vec3(0.5),vec3(0.0),vec3(1.0));
 float gray=dot(adjusted,vec3(0.2126,0.7152,0.0722));
 return clamp(mix(vec3(gray),adjusted,saturation),vec3(0.0),vec3(1.0));
}

vec3 handpaint_underlay(vec3 base,vec2 uv,float upness){
 if(!handpaint_enabled || handpaint_opacity<=0.0)return base;
 float flatness=smoothstep(0.70,0.86,upness);
 if(flatness<0.001)return base; // Never paint the vertical cliff body.
 float theta=radians(handpaint_rotation_degrees);
 vec2 centered=uv-vec2(0.5);
 vec2 artuv=vec2(cos(theta)*centered.x-sin(theta)*centered.y,
                 sin(theta)*centered.x+cos(theta)*centered.y)+vec2(0.5);
 if(artuv.x<=0.0||artuv.y<=0.0||artuv.x>=1.0||artuv.y>=1.0)return base;
 float edge=min(min(artuv.x,1.0-artuv.x),min(artuv.y,1.0-artuv.y));
 float edge_fade=smoothstep(0.0,0.06,edge);
 vec4 artwork=texture(handpaint_texture,artuv);
 float lightness=dot(artwork.rgb,vec3(0.2126,0.7152,0.0722));
 float ink=clamp((1.0-lightness)*handpaint_contrast,0.0,1.0);
 float coverage=1.0-smoothstep(0.985,0.999,lightness);
 float strength=clamp(handpaint_opacity*artwork.a*edge_fade*flatness*coverage*ink,0.0,1.0);
 if(strength<0.0001)return base;
 vec3 underlay=vec3(0.5-0.5*ink);
 vec3 mixed=blend_rgb(underlay,base,handpaint_blend_mode);
 float old_luma=dot(base,vec3(0.2126,0.7152,0.0722));
 float new_luma=dot(mixed,vec3(0.2126,0.7152,0.0722));
 vec3 biome_hue=clamp(base*(new_luma/max(old_luma,0.002)),vec3(0.0),vec3(1.0));
 return mix(base,biome_hue,strength);
}

void fragment(){
 vec2 muv=vec2(wt_pos.x/630.0+0.5,0.5-wt_pos.z/630.0);
 float mf=texture(mask_forest,muv).r;
 float md=texture(mask_desert,muv).r;
 float mp=texture(mask_plains,muv).r;
 float ms=texture(mask_swamp,muv).r;
 float mm=texture(mask_mountain,muv).r;
 float total=mf+md+mp+ms+mm;
 float upness=abs(wt_normal.y);
 vec2 base_uv=wt_pos.xz/630.0;
 vec2 wall_axis=vec2(abs(wt_normal.x)>abs(wt_normal.z)?wt_pos.z:wt_pos.x,wt_pos.y)/630.0;
 vec3 accum=vec3(0.0);
 vec3 unassigned=vec3(0.30,0.40,0.34);
 if(mf>0.001){accum+=mix(unassigned,color_adjust(texture(ground_forest,base_uv*repeat_forest).rgb,biome_contrast_forest,biome_saturation_forest),ground_opacity_forest)*mf;}
 if(md>0.001){accum+=mix(unassigned,color_adjust(texture(ground_desert,base_uv*repeat_desert).rgb,biome_contrast_desert,biome_saturation_desert),ground_opacity_desert)*md;}
 if(mp>0.001){accum+=mix(unassigned,color_adjust(texture(ground_plains,base_uv*repeat_plains).rgb,biome_contrast_plains,biome_saturation_plains),ground_opacity_plains)*mp;}
 if(ms>0.001){accum+=mix(unassigned,color_adjust(texture(ground_swamp,base_uv*repeat_swamp).rgb,biome_contrast_swamp,biome_saturation_swamp),ground_opacity_swamp)*ms;}
 if(mm>0.001){accum+=mix(unassigned,color_adjust(texture(ground_mountain,base_uv*repeat_mountain).rgb,biome_contrast_mountain,biome_saturation_mountain),ground_opacity_mountain)*mm;}
 vec3 ground=total>0.001?mix(unassigned,accum/max(total,0.001),clamp(total,0.0,1.0)):unassigned;
 ground=handpaint_underlay(ground,muv,upness);

 // The web cliff renderer paints ONLY polygons whose parent has the
 // corresponding biome, on steep geometry. Names/own biomeIds are ignored.
 float cf=texture(cliff_mask_forest,muv).r;
 float cd=texture(cliff_mask_desert,muv).r;
 float cp=texture(cliff_mask_plains,muv).r;
 float cs=texture(cliff_mask_swamp,muv).r;
 float cm=texture(cliff_mask_mountain,muv).r;
 float cliff_total=cf+cd+cp+cs+cm;
 float verticality=1.0-upness;
 float wall_strength=smoothstep(0.10,0.74,verticality);
 vec3 cliff_sum=vec3(0.0);
 float cliff_alpha=0.0;
 if(cf>0.001){
  float a=cf*cliff_intensity_forest;
  cliff_sum+=texture(cliff_forest,wall_axis*cliff_repeat_forest).rgb*a;
  cliff_alpha+=a;
 }
 if(cd>0.001){
  float a=cd*cliff_intensity_desert;
  cliff_sum+=texture(cliff_desert,wall_axis*cliff_repeat_desert).rgb*a;
  cliff_alpha+=a;
 }
 if(cp>0.001){
  float a=cp*cliff_intensity_plains;
  // Plains cliff heightmap is aligned along Z in the original renderer.
  cliff_sum+=texture(cliff_plains,vec2(wt_pos.z,wt_pos.y)/630.0*cliff_repeat_plains).rgb*a;
  cliff_alpha+=a;
 }
 if(cs>0.001){
  float a=cs*cliff_intensity_swamp;
  cliff_sum+=texture(cliff_swamp,wall_axis*cliff_repeat_swamp).rgb*a;
  cliff_alpha+=a;
 }
 if(cm>0.001){
  float a=cm*cliff_intensity_mountain;
  cliff_sum+=texture(cliff_mountain,wall_axis*cliff_repeat_mountain).rgb*a;
  cliff_alpha+=a;
 }
 ALBEDO=ground;
 if(cliff_total>0.001 && cliff_alpha>0.001){
  vec3 cliff_rgb=cliff_sum/max(cliff_alpha,0.001);
  ALBEDO=mix(ground,cliff_rgb,clamp(cliff_alpha*wall_strength,0.0,1.0));
 }
 float active=0.0;
 if(selected_biome==0){active=mf;}
 else if(selected_biome==1){active=md;}
 else if(selected_biome==2){active=mp;}
 else if(selected_biome==3){active=ms;}
 else if(selected_biome==4){active=mm;}
 float selection=clamp(active,0.0,1.0)*editor_tint_strength;
 if(selected_zone_enabled){selection=max(selection,texture(selected_zone_mask,muv).r*0.19);}
 if(cliff_zones_enabled){selection=max(selection,texture(cliff_zones_mask,muv).r*0.10);}
 ALBEDO=mix(ALBEDO,editor_tint.rgb,clamp(selection,0.0,0.24));
 ROUGHNESS=1.0;
}
