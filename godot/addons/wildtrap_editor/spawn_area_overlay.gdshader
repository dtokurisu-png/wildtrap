shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_never, fog_disabled;

uniform vec2 points[128];
uniform int point_count;
uniform bool closed;
uniform vec4 bounds;
uniform float border_width;
uniform vec4 fill_color : source_color;
uniform vec4 border_color : source_color;
varying vec2 map_position;

void vertex() {
	map_position = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xz;
	POSITION = PROJECTION_MATRIX * MODELVIEW_MATRIX * vec4(VERTEX, 1.0);
	// Keep the overlay just in front of the same triangles in reverse Z.
	POSITION.z += 0.0001;
}

void fragment() {
	if (any(lessThan(map_position, bounds.xy)) || any(greaterThan(map_position, bounds.zw))) {
		discard;
	}
	bool inside = false;
	float distance_squared = border_width * border_width;
	vec2 a = points[closed ? point_count - 1 : 0];
	for (int i = (closed ? 0 : 1); i < point_count; i++) {
		vec2 b = points[i];
		vec2 edge = b - a;
		vec2 offset = map_position - a;
		vec2 nearest = offset - edge * clamp(dot(offset, edge) / dot(edge, edge), 0.0, 1.0);
		distance_squared = min(distance_squared, dot(nearest, nearest));
		if (closed && (a.y > map_position.y) != (b.y > map_position.y)) {
			if (map_position.x < a.x + edge.x * offset.y / edge.y) {
				inside = !inside;
			}
		}
		a = b;
	}
	bool on_border = distance_squared < border_width * border_width;
	if (!on_border && !inside) {
		discard;
	}
	vec4 tint = on_border ? border_color : fill_color;
	ALBEDO = tint.rgb;
	ALPHA = tint.a;
}
