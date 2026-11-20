extends Node3D
## Native reader for source-synchronized WildTrap mesh, texture masks and GLB.
## Generated mesh is baked from the original geometry algorithms in GitHub CI.
## Saved cave sculpt operations/vertex locks are NOT yet reproduced in Godot.

const WORLD_PATH := "res://data/world.json"
const BINARY_PATH := "res://data/terrain.wtmesh"
const MODEL_FILES := {
	"stone-cave": "res://assets/models/stone_cave.glb",
	"rocky-cave": "res://assets/models/rocky_cave.glb",
	"stylized-cave": "res://assets/models/stylized_cave.glb",
}
const BIOMES := ["forest", "desert", "plains", "swamp", "mountain"]

var source_world: Dictionary = {}
var vertex_count: int = 0
var triangle_count: int = 0
var terrain: MeshInstance3D

func _ready() -> void:
	if not FileAccess.file_exists(WORLD_PATH) or not FileAccess.file_exists(BINARY_PATH):
		push_error("WildTrap: native world data missing. Check the migration build.")
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(WORLD_PATH))
	if not (parsed is Dictionary):
		push_error("WildTrap: world.json is not a JSON object")
		return
	source_world = parsed
	var size: float = float(source_world.get("size", 0))
	var n: int = int(source_world.get("resolution", 0))
	var heights: Array = source_world.get("heights", [])
	if size != 630.0 or n != 129 or heights.size() != n*n:
		push_error("WildTrap: source dimensions changed unexpectedly")
		return
	if not _read_mesh():
		return
	_add_models()
	print("WILDTRAP_GODOT_WORLD_IMPORTED vertices=", vertex_count,
		" triangles=", triangle_count, " zones=", (source_world.get("zones", []) as Array).size(),
		" source=published_snapshot_partial")

func _read_mesh() -> bool:
	var f := FileAccess.open(BINARY_PATH, FileAccess.READ)
	if f == null:
		push_error("Cannot read native terrain mesh")
		return false
	if f.get_buffer(4).get_string_from_ascii() != "WTG2" or f.get_32() != 1:
		push_error("Unknown WildTrap mesh format")
		return false
	var n: int = f.get_32()
	var indices_n: int = f.get_32()
	if n < 16000 or n > 400000 or indices_n < 30000 or indices_n > 1800000 or indices_n%3 != 0:
		push_error("Invalid WildTrap mesh counts")
		return false
	var expected: int = 16+n*44+indices_n*4
	if f.get_length() != expected:
		push_error("Incorrect WildTrap mesh byte length")
		return false
	var vertices := PackedVector3Array()
	var normals := PackedVector3Array()
	var uv := PackedVector2Array()
	var colors := PackedColorArray()
	vertices.resize(n)
	normals.resize(n)
	uv.resize(n)
	colors.resize(n)
	for i in n:
		vertices[i] = Vector3(f.get_float(), f.get_float(), f.get_float())
		normals[i] = Vector3(f.get_float(), f.get_float(), f.get_float())
		uv[i] = Vector2(f.get_float(), f.get_float())
		colors[i] = Color(f.get_float(), f.get_float(), f.get_float())
	var indices := PackedInt32Array()
	indices.resize(indices_n)
	for i in indices_n:
		indices[i] = f.get_32()
	if f.get_error() != OK and not f.eof_reached():
		push_error("WildTrap mesh read failed")
		return false
	var arrays: Array = []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = vertices
	arrays[Mesh.ARRAY_NORMAL] = normals
	arrays[Mesh.ARRAY_TEX_UV] = uv
	arrays[Mesh.ARRAY_COLOR] = colors
	arrays[Mesh.ARRAY_INDEX] = indices
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	var instance := MeshInstance3D.new()
	instance.name = "WildTrapTerrain"
	instance.mesh = mesh
	instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	add_child(instance)
	terrain = instance
	_apply_material()
	vertex_count = n
	triangle_count = indices_n/3
	return true

func _apply_material() -> void:
	var shader := load("res://shaders/terrain.gdshader") as Shader
	if shader == null:
		push_error("WildTrap terrain shader could not load")
		return
	var material := ShaderMaterial.new()
	material.shader = shader
	for biome in BIOMES:
		var mask := load("res://data/masks/%s.png" % biome) as Texture2D
		var ground := load("res://assets/textures/ground_%s.png" % biome) as Texture2D
		var cliff := load("res://assets/textures/cliff_%s.png" % biome) as Texture2D
		if mask == null or ground == null or cliff == null:
			push_error("Missing biome resource: " + biome)
			continue
		material.set_shader_parameter("mask_%s" % biome, mask)
		material.set_shader_parameter("ground_%s" % biome, ground)
		material.set_shader_parameter("cliff_%s" % biome, cliff)
		var settings: Dictionary = source_world.get("biomeMaterials", {})
		var biome_settings: Dictionary = settings.get(biome, {})
		var slots: Dictionary = biome_settings.get("slots", {})
		var ground_settings: Dictionary = slots.get("ground", {})
		material.set_shader_parameter("repeat_%s" % biome, float(ground_settings.get("scale", 200.0)))
	terrain.material_override = material

func _height_at(x: float, z: float) -> float:
	var n: int = int(source_world.get("resolution", 129))
	var size: float = float(source_world.get("size", 630.0))
	var heights: Array = source_world.get("heights", [])
	var fx: float = clampf((x/size+0.5)*float(n-1),0.0,float(n-1))
	var fz: float = clampf((z/size+0.5)*float(n-1),0.0,float(n-1))
	var ix: int = int(floor(fx))
	var iz: int = int(floor(fz))
	var ax: int = mini(n-1,ix+1)
	var az: int = mini(n-1,iz+1)
	var u: float = fx-float(ix)
	var v: float = fz-float(iz)
	var a: float = lerpf(float(heights[iz*n+ix]),float(heights[iz*n+ax]),u)
	var b: float = lerpf(float(heights[az*n+ix]),float(heights[az*n+ax]),u)
	return lerpf(a,b,v)

func _add_models() -> void:
	var nodes: Array = source_world.get("nodes", [])
	for item in nodes:
		if not (item is Dictionary):
			continue
		var data: Dictionary = item
		var prefab_id: String = str(data.get("prefabId", ""))
		if str(data.get("kind", "")) != "prefab" or not MODEL_FILES.has(prefab_id):
			continue
		var packed := load(MODEL_FILES[prefab_id]) as PackedScene
		if packed == null:
			push_error("Could not import GLB for " + prefab_id)
			continue
		var source: Node3D = packed.instantiate() as Node3D
		if source == null:
			continue
		var root := Node3D.new()
		root.name = "Prefab_%s_%s" % [prefab_id,str(data.get("id", ""))]
		add_child(root)
		root.add_child(source)
		var found := false
		var lower := Vector3(INF, INF, INF)
		var upper := Vector3(-INF, -INF, -INF)
		for mesh_node in source.find_children("*", "MeshInstance3D", true, false):
			var part := mesh_node as MeshInstance3D
			var box := part.get_aabb()
			var transform_to_source: Transform3D = source.global_transform.affine_inverse() * part.global_transform
			for cx in 2:
				for cy in 2:
					for cz in 2:
						var p: Vector3 = box.position+Vector3(box.size.x*cx,box.size.y*cy,box.size.z*cz)
						p = transform_to_source*p
						lower = lower.min(p)
						upper = upper.max(p)
						found = true
		if found:
			var dimensions: Vector3 = upper-lower
			var longest: float = maxf(dimensions.x,maxf(dimensions.y,dimensions.z))
			var scale_factor: float = 46.0/longest if longest > 0.00001 else 1.0
			source.scale = Vector3.ONE*scale_factor
			source.position = Vector3(-(lower.x+upper.x)*0.5, -lower.y, -(lower.z+upper.z)*0.5)*scale_factor
		var x: float = float(data.get("x",0))
		var z: float = float(data.get("z",0))
		var y: float = float(data.get("y", _height_at(x,z)+float(data.get("offsetY",0))))
		root.position = Vector3(x,y+float(data.get("scaleAnchorOffsetY",0)),z)
		root.rotation_order = EULER_ORDER_YXZ
		root.rotation = Vector3(float(data.get("rotationX",0)),float(data.get("rotation",0)),float(data.get("rotationZ",0)))
		root.scale = Vector3.ONE*maxf(0.01,float(data.get("scale",1)))
		for mesh_node in source.find_children("*", "MeshInstance3D", true, false):
			var part := mesh_node as MeshInstance3D
			part.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
