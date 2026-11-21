@tool
extends RefCounted
## Viewport-only picking and editor marker rendering.
## No physics collider, no changes to WildTrap geometry or saved scene owners.
const SPAWNS = preload("res://addons/wildtrap_editor/spawn_rules.gd")
const OVERLAY_NAME := "__WildTrapSpawnOverlay"
const CURSOR_NAME := "__WildTrapSpawnCursor"
const MARKER_BUILD := "R6-adjustable"
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


static func _segment(mesh: ImmediateMesh, a: Vector3,b: Vector3,color: Color) -> void:
	mesh.surface_set_color(color)
	mesh.surface_add_vertex(a)
	mesh.surface_set_color(color)
	mesh.surface_add_vertex(b)


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
			if child is Sprite3D:
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


static func refresh(world: Node3D, source: Dictionary, pending: Array, selected_kind: String, selected_id: Variant, selected_vertex: int) -> void:
	if world==null or not is_instance_valid(world):
		return
	var old := world.get_node_or_null(OVERLAY_NAME)
	if old!=null:
		world.remove_child(old)
		old.queue_free()
	var overlay := MeshInstance3D.new()
	overlay.name=OVERLAY_NAME
	overlay.set_meta("wildtrap_editor_marker",true)
	overlay.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
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
	var has_lines:=pending.size()>1
	for area in source.get("spawnAreas",[]):
		if area is Dictionary and not bool(area.get("hidden",false)) and (area.get("points",[]) as Array).size()>=3:
			has_lines=true
			break
	for item in pending:
		if item is Dictionary:
			var px:=float(item.get("x",0))
			var pz:=float(item.get("z",0))
			var pending_icon:=_make_sprite(texture,"PendingVertex")
			pending_icon.position=Vector3(px,_height(world,px,pz)+3.0,pz)
			overlay.add_child(pending_icon)
	if not has_lines:
		return
	var mesh:=ImmediateMesh.new()
	var material:=StandardMaterial3D.new()
	material.shading_mode=BaseMaterial3D.SHADING_MODE_UNSHADED
	material.no_depth_test=true
	material.vertex_color_use_as_albedo=true
	mesh.surface_begin(Mesh.PRIMITIVE_LINES,material)
	for area in source.get("spawnAreas",[]):
		if not (area is Dictionary) or bool(area.get("hidden",false)):
			continue
		var points: Array=area.get("points",[])
		if points.size()<3:
			continue
		var selected:=selected_kind=="area" and str(area.get("id",""))==str(selected_id)
		var tint:=Color(1,0.84,0.56,1) if selected else Color(0.54,0.95,0.63,1)
		for i in range(points.size()):
			var a: Dictionary=points[i]
			var b: Dictionary=points[(i+1)%points.size()]
			var ax:=float(a.get("x",0))
			var az:=float(a.get("z",0))
			var bx:=float(b.get("x",0))
			var bz:=float(b.get("z",0))
			_segment(mesh,Vector3(ax,_height(world,ax,az)+2,az),Vector3(bx,_height(world,bx,bz)+2,bz),tint)
	for i in range(1,pending.size()):
		var prev: Dictionary=pending[i-1]
		var item: Dictionary=pending[i]
		var ax:=float(prev.get("x",0))
		var az:=float(prev.get("z",0))
		var bx:=float(item.get("x",0))
		var bz:=float(item.get("z",0))
		_segment(mesh,Vector3(ax,_height(world,ax,az)+2,az),Vector3(bx,_height(world,bx,bz)+2,bz),Color(1,0.83,0.51,1))
	mesh.surface_end()
	overlay.mesh=mesh


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
		if not bool(area.get("hidden",false)) and SPAWNS.contains(area.get("points",[]),x,z):
			return area
	return {}
