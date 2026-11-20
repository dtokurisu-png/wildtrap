@tool
extends RefCounted
## Viewport-only picking and editor marker rendering.
## No physics collider, no changes to WildTrap geometry or saved scene owners.
const SPAWNS = preload("res://addons/wildtrap_editor/spawn_rules.gd")
const OVERLAY_NAME := "__WildTrapSpawnOverlay"


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


static func _point_mark(mesh: ImmediateMesh, point: Vector3,color: Color) -> void:
	_segment(mesh,point+Vector3(-2,0,0),point+Vector3(2,0,0),color)
	_segment(mesh,point+Vector3(0,0,-2),point+Vector3(0,0,2),color)
	_segment(mesh,point,point+Vector3(0,5,0),color)


static func refresh(world: Node3D, source: Dictionary, pending: Array, selected_kind: String, selected_id: Variant, selected_vertex: int) -> void:
	if world==null or not is_instance_valid(world):
		return
	var old := world.get_node_or_null(OVERLAY_NAME)
	if old!=null:
		world.remove_child(old)
		old.queue_free()
	var mesh := ImmediateMesh.new()
	var material := StandardMaterial3D.new()
	material.shading_mode=BaseMaterial3D.SHADING_MODE_UNSHADED
	material.no_depth_test=true
	material.vertex_color_use_as_albedo=true
	material.albedo_color=Color(1,1,1,1)
	mesh.surface_begin(Mesh.PRIMITIVE_LINES,material)
	for node in source.get("nodes",[]):
		if not (node is Dictionary) or not SPAWNS.is_spawn_node(node):
			continue
		var x := float(node.get("x",0))
		var z := float(node.get("z",0))
		var p := Vector3(x,_height(world,x,z)+2.5,z)
		var cat: String = SPAWNS.point_category(node)
		var tint := Color(0.50,0.72,0.89,1.0) if cat=="player" else Color(0.75,0.70,0.92,1.0)
		if not ["player","npc"].has(cat):
			tint=Color(0.64,0.77,0.59,1.0)
		if selected_kind=="point" and int(node.get("id",-1))==int(selected_id):
			tint=Color(1.0,0.87,0.53,1.0)
		_point_mark(mesh,p,tint)
	for area in source.get("spawnAreas",[]):
		if not (area is Dictionary) or bool(area.get("hidden",false)):
			continue
		var points: Array = area.get("points",[])
		if points.size()<3:
			continue
		var selected := selected_kind=="area" and str(area.get("id",""))==str(selected_id)
		var tint := Color(1,0.84,0.56,1) if selected else Color(0.54,0.76,0.63,1)
		for i in range(points.size()):
			var a: Dictionary = points[i]
			var b: Dictionary = points[(i+1)%points.size()]
			var ax := float(a.get("x",0))
			var az := float(a.get("z",0))
			var bx := float(b.get("x",0))
			var bz := float(b.get("z",0))
			_segment(mesh,Vector3(ax,_height(world,ax,az)+2,az),
				Vector3(bx,_height(world,bx,bz)+2,bz),tint)
			if selected:
				var p := Vector3(ax,_height(world,ax,az)+2.5,az)
				_point_mark(mesh,p,Color(1,0.94,0.66,1) if i==selected_vertex else tint)
	var pending_tint := Color(1,0.83,0.51,1)
	for i in range(pending.size()):
		var p: Dictionary = pending[i]
		var x := float(p.get("x",0))
		var z := float(p.get("z",0))
		_point_mark(mesh,Vector3(x,_height(world,x,z)+2,z),pending_tint)
		if i>0:
			var prev: Dictionary = pending[i-1]
			var px := float(prev.get("x",0))
			var pz := float(prev.get("z",0))
			_segment(mesh,Vector3(px,_height(world,px,pz)+2,pz),Vector3(x,_height(world,x,z)+2,z),pending_tint)
	mesh.surface_end()
	var overlay := MeshInstance3D.new()
	overlay.name=OVERLAY_NAME
	overlay.set_meta("wildtrap_editor_marker",true)
	overlay.mesh=mesh
	overlay.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	world.add_child(overlay)
	# No owner: never permanently store the editor markers in main.tscn.


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
