@tool
extends RefCounted
## Viewport-only picking and editor marker rendering.
## No physics collider, no changes to WildTrap geometry or saved scene owners.
const SPAWNS = preload("res://addons/wildtrap_editor/spawn_rules.gd")
const AREA_SHADER = preload("res://addons/wildtrap_editor/spawn_area_overlay.gdshader")
const OVERLAY_NAME := "__WildTrapSpawnOverlay"
const CURSOR_NAME := "__WildTrapSpawnCursor"
const MARKER_BUILD := "R6-adjustable"
const AREA_BORDER_WIDTH := 1.25
const DRAFT_VERTEX_RADIUS := 12.0
const MARKER_BASE_PIXEL_SIZE := 0.004
const DEFAULT_MARKER_SCALE := 0.35
static var _marker_scale: float = DEFAULT_MARKER_SCALE


static func pick_mesh(ray_origin: Vector3, ray_direction: Vector3, terrain: MeshInstance3D) -> Variant:
	if terrain==null or terrain.mesh==null or terrain.mesh.get_surface_count()<1:
		return null
	var arrays: Array = terrain.mesh.surface_get_arrays(0)
	var verts: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
	var indices: PackedInt32Array = arrays[Mesh.ARRAY_INDEX]
	if verts.is_empty() or indices.is_empty():
		return null
	var inverse := terrain.global_transform.affine_inverse()
	var from_local: Vector3 = inverse*ray_origin
	var dir_local: Vector3 = (inverse.basis*ray_direction).normalized()
	var best_distance := INF
	var best: Variant = null
	for i in range(0,indices.size(),3):
		var hit: Variant = Geometry3D.ray_intersects_triangle(
			from_local,dir_local,verts[indices[i]],verts[indices[i+1]],verts[indices[i+2]])
		if hit is Vector3:
			var world_hit: Vector3 = terrain.global_transform*hit
			var distance: float = ray_origin.distance_squared_to(world_hit)
			if distance<best_distance and (world_hit-ray_origin).dot(ray_direction)>0.0:
				best_distance=distance
				best=world_hit
	return best


static func pick_terrain(camera: Camera3D, screen_point: Vector2, world: Node3D) -> Variant:
	if camera==null or world==null:
		return null
	var terrain := world.get_node_or_null("WildTrapTerrain") as MeshInstance3D
	return pick_mesh(camera.project_ray_origin(screen_point),camera.project_ray_normal(screen_point).normalized(),terrain)


static func _height(world: Node3D, x: float, z: float) -> float:
	if world.has_method("_height_at"):
		return float(world.call("_height_at",x,z))
	return 0.0


# Billboard indicators stay the same screen size at any zoom.
static func _marker_texture() -> Texture2D:
	var img := Image.create_empty(80,104,false,Image.FORMAT_RGBA8)
	img.fill(Color(0,0,0,0))
	for y in range(104):
		for x in range(80):
			var dx := (float(x)-39.5)/34.0
			var dy := (float(y)-43.0)/39.0
			var d := dx*dx+dy*dy
			if d<=1.0:
				img.set_pixel(x,y,Color(0.02,0.11,0.04,1.0) if d>0.77 else Color(0.16,1.0,0.30,1.0))
			if x>=34 and x<=45 and y>=19 and y<=55:
				img.set_pixel(x,y,Color(0.015,0.07,0.025,1.0))
			if (float(x)-39.5)*(float(x)-39.5)+(float(y)-68.0)*(float(y)-68.0)<=45.0:
				img.set_pixel(x,y,Color(0.015,0.07,0.025,1.0))
	# Downsize the ACTUAL texture, not only Sprite3D.pixel_size.
	# Fixed-size billboards in the editor must remain compact at all zooms.
	img.resize(24,32,Image.INTERPOLATE_LANCZOS)
	return ImageTexture.create_from_image(img)


static func _make_sprite(texture: Texture2D, sprite_name: String) -> Sprite3D:
	var icon := Sprite3D.new()
	icon.name=sprite_name
	icon.texture=texture
	icon.billboard=BaseMaterial3D.BILLBOARD_ENABLED
	icon.fixed_size=true
	icon.no_depth_test=true
	icon.shaded=false
	# Keep screen size stable while using a 24x32 source image.
	# Independent 42px hit area remains in closest_screen_point().
	icon.pixel_size=MARKER_BASE_PIXEL_SIZE*_marker_scale
	icon.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	icon.set_meta("wildtrap_editor_marker",true)
	return icon


# Resize already drawn markers immediately, including the active cursor.
# New sprites use the same setting when the overlay is rebuilt.
static func set_marker_scale(world: Node3D, factor: float) -> void:
	_marker_scale=clampf(factor,0.05,2.0)
	if not is_instance_valid(world):
		return
	var cursor:=world.get_node_or_null(CURSOR_NAME) as Sprite3D
	if cursor!=null:
		cursor.pixel_size=MARKER_BASE_PIXEL_SIZE*_marker_scale
	var overlay:=world.get_node_or_null(OVERLAY_NAME)
	if overlay!=null:
		for child in overlay.get_children():
			if child is Sprite3D and child.name.begins_with("SpawnMarker_"):
				(child as Sprite3D).pixel_size=MARKER_BASE_PIXEL_SIZE*_marker_scale


static func clear_cursor(world: Node3D) -> void:
	if world==null:
		return
	var cursor := world.get_node_or_null(CURSOR_NAME)
	if cursor!=null:
		world.remove_child(cursor)
		cursor.queue_free()


static func set_cursor(world: Node3D, position: Variant) -> void:
	if world==null:
		return
	var cursor := world.get_node_or_null(CURSOR_NAME) as Sprite3D
	if not (position is Vector3):
		if cursor!=null:
			cursor.visible=false
		return
	if cursor==null:
		cursor=_make_sprite(_marker_texture(),CURSOR_NAME)
		world.add_child(cursor)
	cursor.global_position=(position as Vector3)+Vector3.UP*3.0
	cursor.visible=true


static func refresh(world: Node3D, source: Dictionary, pending: PackedVector3Array, selected_kind: String, selected_id: Variant) -> void:
	if world==null or not is_instance_valid(world):
		return
	var old := world.get_node_or_null(OVERLAY_NAME)
	if old!=null:
		world.remove_child(old)
		old.queue_free()
	var overlay := Node3D.new()
	overlay.name=OVERLAY_NAME
	overlay.set_meta("wildtrap_editor_marker",true)
	world.add_child(overlay)
	var texture := _marker_texture()
	for node in source.get("nodes",[]):
		if not (node is Dictionary) or not SPAWNS.is_spawn_node(node):
			continue
		var x:=float(node.get("x",0))
		var z:=float(node.get("z",0))
		var icon:=_make_sprite(texture,"SpawnMarker_"+str(node.get("id","")))
		icon.position=Vector3(x,_height(world,x,z)+3.0,z)
		if selected_kind=="point" and int(node.get("id",-1))==int(selected_id):
			icon.modulate=Color(0.78,1.0,0.77,1.0)
		overlay.add_child(icon)
	var terrain := world.get_node_or_null("WildTrapTerrain") as MeshInstance3D
	if terrain==null or terrain.mesh==null:
		return
	for area in source.get("spawnAreas",[]):
		if not (area is Dictionary) or bool(area.get("hidden",false)):
			continue
		var points := _area_points(area.get("points",[]))
		if points.size()<3:
			continue
		var selected:=selected_kind=="area" and str(area.get("id",""))==str(selected_id)
		_add_area_surface(overlay, terrain, points, true, selected)
	if pending.is_empty():
		return
	var draft := PackedVector2Array()
	var vertex_texture := _draft_vertex_texture()
	for i in pending.size():
		var point := pending[i]
		draft.append(Vector2(point.x, point.z))
		var vertex := _make_sprite(vertex_texture, "AreaVertex")
		vertex.pixel_size = 0.0038 if i==0 else 0.0025
		vertex.modulate = Color(1.0, 0.8, 0.4) if i==0 else Color(1.0, 0.45, 0.08)
		overlay.add_child(vertex, true)
		vertex.global_position = point
	if draft.size()>1:
		_add_area_surface(overlay, terrain, draft, false, false)


static func _area_points(records: Array) -> PackedVector2Array:
	var points := PackedVector2Array()
	for point in records:
		points.append(Vector2(float(point["x"]), float(point["z"])))
	return points


static func _draft_vertex_texture() -> Texture2D:
	var image := Image.create_empty(20, 20, false, Image.FORMAT_RGBA8)
	for y in image.get_height():
		for x in image.get_width():
			var distance := Vector2(x + 0.5, y + 0.5).distance_to(Vector2(10, 10))
			if distance < 9.5:
				image.set_pixel(x, y, Color(0.28, 0.08, 0.01) if distance > 7.0 else Color.WHITE)
	return ImageTexture.create_from_image(image)


static func _add_area_surface(overlay: Node3D, terrain: MeshInstance3D, points: PackedVector2Array, closed: bool, selected: bool) -> void:
	var bounds := Rect2(points[0], Vector2.ZERO)
	for point in points:
		bounds = bounds.expand(point)
	bounds = bounds.grow(AREA_BORDER_WIDTH)
	var material := ShaderMaterial.new()
	material.shader = AREA_SHADER
	material.render_priority = 102 if not closed else (101 if selected else 100)
	material.set_shader_parameter("point_count", points.size())
	var shader_points := points.duplicate()
	shader_points.resize(128)
	material.set_shader_parameter("points", shader_points)
	material.set_shader_parameter("bounds", Vector4(bounds.position.x, bounds.position.y, bounds.end.x, bounds.end.y))
	material.set_shader_parameter("border_width", AREA_BORDER_WIDTH)
	material.set_shader_parameter("closed", closed)
	material.set_shader_parameter("fill_color", Color(1.0, 0.38, 0.05, 0.36 if selected else 0.27))
	material.set_shader_parameter("border_color", Color(1.0, 0.63 if selected else 0.44, 0.08, 1.0))
	var surface := MeshInstance3D.new()
	surface.name = "AreaSurface" if closed else "AreaDraft"
	surface.mesh = terrain.mesh
	surface.material_override = material
	surface.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	overlay.add_child(surface, true)
	surface.global_transform = terrain.global_transform


static func marker_screen_radius(camera: Camera3D) -> float:
	var viewport_height := camera.get_viewport().get_visible_rect().size.y
	return clampf(viewport_height * 16.0 * MARKER_BASE_PIXEL_SIZE * _marker_scale, 8.0, 42.0)


static func closest_screen_point(source: Dictionary, camera: Camera3D, screen: Vector2, world: Node3D, radius_pixels: float = 42.0) -> Dictionary:
	var nearest: Dictionary={}
	var best:=radius_pixels*radius_pixels
	for node in source.get("nodes",[]):
		if not (node is Dictionary) or not SPAWNS.is_spawn_node(node):
			continue
		var x:=float(node.get("x",0))
		var z:=float(node.get("z",0))
		var position:=Vector3(x,_height(world,x,z)+3.0,z)
		if camera.is_position_behind(position):
			continue
		var projection:=camera.unproject_position(position)
		var distance:=projection.distance_squared_to(screen)
		if distance<best:
			best=distance
			nearest=node
	return nearest


static func closest_point(source: Dictionary, x: float, z: float, threshold: float = 5.0) -> Dictionary:
	var candidate: Dictionary = {}
	var best := threshold*threshold
	for node in source.get("nodes",[]):
		if not (node is Dictionary) or not SPAWNS.is_spawn_node(node):
			continue
		var d := Vector2(float(node.get("x",0))-x,float(node.get("z",0))-z).length_squared()
		if d<best:
			best=d
			candidate=node
	return candidate


static func containing_area(source: Dictionary, x: float, z: float) -> Dictionary:
	var areas: Array = source.get("spawnAreas",[])
	for i in range(areas.size()-1,-1,-1):
		var area: Dictionary = areas[i]
		if bool(area.get("hidden", false)):
			continue
		var records: Array = area.get("points", [])
		if records.size()<3:
			continue
		if SPAWNS.contains(records, x, z):
			return area
		var points := _area_points(records)
		var position := Vector2(x, z)
		var previous := points[-1]
		for point in points:
			var nearest := Geometry2D.get_closest_point_to_segment(position, previous, point)
			if position.distance_squared_to(nearest) <= AREA_BORDER_WIDTH * AREA_BORDER_WIDTH:
				return area
			previous = point
	return {}
