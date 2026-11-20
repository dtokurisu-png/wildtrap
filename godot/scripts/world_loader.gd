@tool
extends Node3D
## Native reader for source-synchronized WildTrap mesh, texture masks and GLB.
## Generated mesh is baked from the original geometry algorithms in GitHub CI.
## Saved cave sculpt operations/vertex locks are NOT yet reproduced in Godot.

const WORLD_PATH := "res://data/world.json"
const BINARY_PATH := "res://data/terrain.wtmesh"
const MODEL_CATALOG := "res://data/object-catalog.json"
const BIOMES := ["forest", "desert", "plains", "swamp", "mountain"]
const BIOME_MASKS = preload("res://addons/wildtrap_editor/biome_masks.gd")
const DETAIL_MAP := "res://data/detail-textures.json"
const HANDPAINT_IMAGE := "res://assets/textures/handpaint_reference.webp"

# Native editor preview: generated children are deliberately NOT assigned owner.
# They appear in the 3D viewport but are not serialized into main.tscn.
@export_group("WildTrap · Vista previa")
@export var preview_in_editor: bool = true:
	set(value):
		preview_in_editor = value
		if Engine.is_editor_hint() and is_inside_tree():
			call_deferred("_rebuild_world")

@export_tool_button("Actualizar vista del mundo", "Reload") var refresh_world: Callable = _refresh_editor_preview

func _refresh_editor_preview() -> void:
	if Engine.is_editor_hint() and is_inside_tree():
		call_deferred("_rebuild_world")


func _clear_generated() -> void:
	for child in get_children():
		if child.has_meta("wildtrap_generated"):
			remove_child(child)
			child.queue_free()
	terrain = null
	vertex_count = 0
	triangle_count = 0
	detail_layer_count = 0
	cliff_masks_loaded = 0
	handpaint_loaded = false
	_detail_materials.clear()


var source_world: Dictionary = {}
var vertex_count: int = 0
var triangle_count: int = 0
var detail_layer_count: int = 0
var _detail_materials: Array = []
var handpaint_loaded := false
var cliff_masks_loaded := 0
var _editor_details_enabled := true
var _editor_handpaint_enabled := true
var _editor_cliff_color_enabled := true
var _editor_handpaint_opacity := 0.50

func set_editor_details_visible(enabled: bool) -> void:
	_editor_details_enabled=enabled
	for child in get_children():
		if child is MeshInstance3D and child.name.begins_with("WildTrapDetail_"):
			child.visible=enabled


func set_editor_handpaint_visible(enabled: bool) -> void:
	_editor_handpaint_enabled=enabled
	if is_instance_valid(terrain) and terrain.material_override is ShaderMaterial:
		terrain.material_override.set_shader_parameter("handpaint_enabled",enabled)


func set_editor_handpaint_opacity(value: float) -> void:
	_editor_handpaint_opacity=clampf(value,0.0,1.0)
	if is_instance_valid(terrain) and terrain.material_override is ShaderMaterial:
		terrain.material_override.set_shader_parameter("handpaint_opacity",_editor_handpaint_opacity)


func set_editor_cliff_colors_visible(enabled: bool) -> void:
	_editor_cliff_color_enabled=enabled
	if not is_instance_valid(terrain) or not (terrain.material_override is ShaderMaterial):
		return
	var mat:=terrain.material_override as ShaderMaterial
	var cliff_settings: Dictionary=source_world.get("cliffHeightSettings",{})
	var biome_overrides: Dictionary=cliff_settings.get("biomes",{})
	for biome in BIOMES:
		var own: Dictionary=biome_overrides.get(biome,{})
		var strength:=clampf(float(own.get("intensity",1.0)),0.0,1.0) if enabled else 0.0
		mat.set_shader_parameter("cliff_intensity_"+biome,strength)


var terrain: MeshInstance3D
var _editor_selected_biome := ""
var _editor_selected_zone: Dictionary = {}
var _editor_show_cliff_areas := false
var _cliff_preview_texture: Texture2D


func set_editor_biome_selection(biome: String) -> void:
	_editor_selected_biome=biome
	if is_instance_valid(terrain) and terrain.material_override is ShaderMaterial:
		terrain.material_override.set_shader_parameter("selected_biome",BIOMES.find(biome))


func set_editor_zone_selection(zone: Dictionary) -> void:
	_editor_selected_zone=zone.duplicate(true)
	_update_editor_zone_mask()


func set_editor_cliffs_visible(enabled: bool) -> void:
	# A temporary selection overlay, never hiding source cliff geometry.
	_editor_show_cliff_areas=enabled
	_update_editor_cliff_mask()


func _update_editor_zone_mask() -> void:
	if not Engine.is_editor_hint() or not is_instance_valid(terrain):
		return
	var material := terrain.material_override as ShaderMaterial
	if material==null:
		return
	var points: Array = _editor_selected_zone.get("points",[])
	if points.size()<3:
		material.set_shader_parameter("selected_zone_enabled",false)
		return
	var zone_image: Image = BIOME_MASKS.make_zone_mask(source_world,_editor_selected_zone)
	material.set_shader_parameter("selected_zone_mask",ImageTexture.create_from_image(zone_image))
	material.set_shader_parameter("selected_zone_enabled",true)


func _update_editor_cliff_mask() -> void:
	if not Engine.is_editor_hint() or not is_instance_valid(terrain):
		return
	var material := terrain.material_override as ShaderMaterial
	if material==null:
		return
	if _editor_show_cliff_areas:
		if _cliff_preview_texture==null:
			_cliff_preview_texture=ImageTexture.create_from_image(BIOME_MASKS.make_cliff_mask(source_world))
		material.set_shader_parameter("cliff_zones_mask",_cliff_preview_texture)
	material.set_shader_parameter("cliff_zones_enabled",_editor_show_cliff_areas)


func apply_editor_biome_preview(next_source: Dictionary, biome: String = "") -> void:
	if not Engine.is_editor_hint():
		return
	source_world=next_source.duplicate(true)
	_cliff_preview_texture=null
	_editor_selected_biome=biome
	if not is_instance_valid(terrain):
		return
	var shader_mat := terrain.material_override as ShaderMaterial
	if shader_mat == null:
		return
	# Use one native polygon rasterizer for editor preview AND saved PNG masks.
	var images: Dictionary = BIOME_MASKS.make(source_world)
	var cliffs: Dictionary = BIOME_MASKS.make_cliff_biome_masks(source_world)
	var preview_masks: Dictionary = {}
	for id_biome in BIOMES:
		var image: Image = images.get(id_biome)
		if image != null:
			var texture := ImageTexture.create_from_image(image)
			preview_masks[id_biome]=texture
			shader_mat.set_shader_parameter("mask_"+id_biome,texture)
		var cliff_image: Image=cliffs.get(id_biome)
		if cliff_image!=null:
			shader_mat.set_shader_parameter("cliff_mask_"+id_biome,ImageTexture.create_from_image(cliff_image))
	for entry in _detail_materials:
		var mask: Texture2D = preview_masks.get(str(entry.get("biome","")))
		if mask != null:
			var layer_mat: ShaderMaterial=entry.get("material")
			if layer_mat!=null:
				layer_mat.set_shader_parameter("region_mask",mask)
	set_editor_biome_selection(biome)
	_update_editor_zone_mask()
	_update_editor_cliff_mask()



func _ready() -> void:
	# The 3D editor needs the same visual terrain as the running game.
	# Defer editor rebuild until imported GLBs, textures and scene tree are ready.
	if Engine.is_editor_hint():
		call_deferred("_rebuild_world")
	else:
		_rebuild_world()


func _rebuild_world() -> void:
	_clear_generated()
	if Engine.is_editor_hint() and not preview_in_editor:
		return
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
		" source=published_snapshot_partial editor=", Engine.is_editor_hint())

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
	instance.set_meta("wildtrap_generated", true)
	instance.mesh = mesh
	instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	add_child(instance)
	terrain = instance
	_apply_material()
	_add_detail_layers()
	vertex_count = n
	triangle_count = indices_n/3
	return true

func _apply_material() -> void:
	var shader := load("res://shaders/terrain.gdshader") as Shader
	if shader==null:
		push_error("WildTrap: cannot load terrain shader")
		return
	var material := ShaderMaterial.new()
	material.shader=shader
	var cliff_settings: Dictionary=source_world.get("cliffHeightSettings",{})
	var biome_overrides: Dictionary=cliff_settings.get("biomes",{})
	var cliff_images: Dictionary={}
	for biome in BIOMES:
		var fallback: Image = null
		var mask := load("res://data/masks/%s.png" % biome) as Texture2D
		var ground := load("res://assets/textures/ground_%s.png" % biome) as Texture2D
		var cliff := load("res://assets/textures/cliff_%s.png" % biome) as Texture2D
		if mask==null or ground==null or cliff==null:
			push_error("Missing ground/cliff biome resource: "+biome)
			continue
		material.set_shader_parameter("mask_"+biome,mask)
		material.set_shader_parameter("ground_"+biome,ground)
		material.set_shader_parameter("cliff_"+biome,cliff)
		var cliff_mask := load("res://data/masks/cliff_%s.png" % biome) as Texture2D
		if cliff_mask==null:
			# This allows the native inspector to render an unsaved local world
			# before its first CI bake, but the bake will produce PNG masks.
			if cliff_images.is_empty():
				cliff_images=BIOME_MASKS.make_cliff_biome_masks(source_world)
			fallback=cliff_images.get(biome)
			if fallback!=null:
				cliff_mask=ImageTexture.create_from_image(fallback)
		if cliff_mask!=null:
			material.set_shader_parameter("cliff_mask_"+biome,cliff_mask)
			cliff_masks_loaded+=1
		var settings: Dictionary=source_world.get("biomeMaterials",{})
		var biome_settings: Dictionary=settings.get(biome,{})
		var slots: Dictionary=biome_settings.get("slots",{})
		var ground_settings: Dictionary=slots.get("ground",{})
		material.set_shader_parameter("repeat_"+biome,float(ground_settings.get("scale",200.0)))
		material.set_shader_parameter("ground_opacity_"+biome,clampf(float(ground_settings.get("opacity",1.0)),0.0,1.0))
		material.set_shader_parameter("biome_contrast_"+biome,clampf(float(biome_settings.get("colorContrast",1.0)),0.0,3.0))
		material.set_shader_parameter("biome_saturation_"+biome,clampf(float(biome_settings.get("colorSaturation",1.0)),0.0,3.0))
		var own: Dictionary=biome_overrides.get(biome,{})
		var repeats:=float(own.get("repeats",0.0))
		if repeats<3.5 or repeats>315.0:
			if biome=="plains" and float(cliff_settings.get("period",0.0))>=2.0:
				repeats=630.0/float(cliff_settings.get("period",12.6))
			else:
				repeats=26.25
		material.set_shader_parameter("cliff_repeat_"+biome,repeats)
		material.set_shader_parameter("cliff_intensity_"+biome,clampf(float(own.get("intensity",1.0)),0.0,1.0) if _editor_cliff_color_enabled else 0.0)
	var painted:=load(HANDPAINT_IMAGE) as Texture2D
	handpaint_loaded=painted!=null
	if handpaint_loaded:
		material.set_shader_parameter("handpaint_texture",painted)
		material.set_shader_parameter("handpaint_enabled",_editor_handpaint_enabled)
		var art_settings: Dictionary=source_world.get("handpaintMaterial",{})
		_editor_handpaint_opacity=clampf(float(art_settings.get("opacity",0.50)),0.0,1.0)
		material.set_shader_parameter("handpaint_opacity",_editor_handpaint_opacity)
		material.set_shader_parameter("handpaint_contrast",clampf(float(art_settings.get("contrast",0.45)),0.0,4.0))
		material.set_shader_parameter("handpaint_rotation_degrees",float(art_settings.get("rotation",180.0)))
		material.set_shader_parameter("handpaint_blend_mode",int(art_settings.get("blendMode",3)))
		var mix_data: Dictionary=source_world.get("groundMix",{})
		material.set_shader_parameter("ground_blend_mode",int(mix_data.get("mode",art_settings.get("blendMode",3))))
		material.set_shader_parameter("ground_transparency",clampf(float(mix_data.get("opacity",1.0)),0.0,1.0))
	else:
		material.set_shader_parameter("handpaint_enabled",false)
		push_warning("WildTrap hand-painted terrain image missing")
	terrain.material_override=material
	if Engine.is_editor_hint():
		set_editor_biome_selection(_editor_selected_biome)
		_update_editor_zone_mask()
		_update_editor_cliff_mask()


func _add_detail_layers() -> void:
	if not FileAccess.file_exists(DETAIL_MAP) or not is_instance_valid(terrain):
		push_warning("WildTrap: native complementary image catalogue is missing.")
		return
	var catalog_value: Variant=JSON.parse_string(FileAccess.get_file_as_string(DETAIL_MAP))
	if not (catalog_value is Dictionary):
		push_error("WildTrap: complementary image catalogue is invalid")
		return
	var catalog: Dictionary=catalog_value
	var detail_shader:=load("res://shaders/detail_layer.gdshader") as Shader
	if detail_shader==null:
		push_error("WildTrap: cannot load detail shader")
		return
	var materials: Dictionary=source_world.get("biomeMaterials",{})
	for biome in BIOMES:
		var config: Dictionary=materials.get(biome,{})
		var slots: Dictionary=config.get("slots",{})
		var mask:=load("res://data/masks/%s.png" % biome) as Texture2D
		if mask==null:
			continue
		for layer in range(1,4):
			var slot: Dictionary=slots.get("detail"+str(layer),{})
			var name_text:=str(slot.get("name",""))
			if name_text.is_empty() or not catalog.has(name_text):
				continue
			var asset_path:=str(catalog[name_text])
			if not asset_path.begins_with("res://assets/textures/details/"):
				push_error("WildTrap detail resource outside permitted asset directory")
				continue
			var art:=load(asset_path) as Texture2D
			if art==null:
				push_warning("WildTrap complementary texture not imported: "+name_text)
				continue
			var strength:=clampf(float(slot.get("opacity",0.5)),0.0,1.0)
			if strength<=0.0:
				continue
			var layer_material:=ShaderMaterial.new()
			layer_material.shader=detail_shader
			layer_material.render_priority=layer
			layer_material.set_shader_parameter("region_mask",mask)
			layer_material.set_shader_parameter("detail_texture",art)
			layer_material.set_shader_parameter("repeats",clampf(float(slot.get("scale",200.0)),0.25,1000.0))
			layer_material.set_shader_parameter("intensity",strength)
			layer_material.set_shader_parameter("variation_seed",float((config.get("noise",{}) as Dictionary).get("seed",1)))
			layer_material.set_shader_parameter("layer_number",float(layer))
			layer_material.set_shader_parameter("biome_contrast",clampf(float(config.get("colorContrast",1.0)),0.0,3.0))
			layer_material.set_shader_parameter("biome_saturation",clampf(float(config.get("colorSaturation",1.0)),0.0,3.0))
			var instance:=MeshInstance3D.new()
			instance.name="WildTrapDetail_%s_%d" % [biome,layer]
			instance.set_meta("wildtrap_generated",true)
			instance.mesh=terrain.mesh
			instance.material_override=layer_material
			instance.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			instance.visible=_editor_details_enabled
			add_child(instance)
			_detail_materials.append({"biome":biome,"layer":layer,"material":layer_material})
			detail_layer_count+=1
	print("WILDTRAP_TEXTURE_MIGRATION detail_layers=",detail_layer_count,
		" cliff_masks=",cliff_masks_loaded," handpaint=",handpaint_loaded)


func get_material_migration_summary() -> Dictionary:
	return {
		"detail_layers":detail_layer_count,
		"cliff_masks":cliff_masks_loaded,
		"handpaint":handpaint_loaded,
		"handpaint_alpha":(terrain.material_override as ShaderMaterial).get_shader_parameter("handpaint_opacity") if is_instance_valid(terrain) and terrain.material_override is ShaderMaterial else 0.0
	}


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

func _model_specs() -> Dictionary:
	var specs: Dictionary={}
	var parsed: Variant=JSON.parse_string(FileAccess.get_file_as_string(MODEL_CATALOG))
	if parsed is Array:
		for item in parsed:
			if item is Dictionary:
				specs[str(item.get("id",""))]=item
	return specs


func apply_editor_objects_preview(next_world: Dictionary) -> void:
	if not Engine.is_editor_hint():
		return
	source_world=next_world.duplicate(true)
	for child in get_children():
		if child.has_meta("wildtrap_generated") and child.name.begins_with("Prefab_"):
			remove_child(child)
			child.queue_free()
	_add_models()


func apply_editor_material_preview(next_world: Dictionary) -> void:
	if not Engine.is_editor_hint() or not is_instance_valid(terrain):
		return
	# Editing numbers must NOT reconstruct 15 × 90k-triangle overlays on every
	# spinbox tick. Bind texture/uniform changes on existing materials only.
	source_world=next_world.duplicate(true)
	var terrain_material:=terrain.material_override as ShaderMaterial
	if terrain_material==null:
		return
	var materials: Dictionary=source_world.get("biomeMaterials",{})
	var heights: Dictionary=source_world.get("cliffHeightSettings",{})
	var cliff_biomes: Dictionary=heights.get("biomes",{})
	var catalog_value: Variant=JSON.parse_string(FileAccess.get_file_as_string(DETAIL_MAP))
	var catalog: Dictionary=catalog_value if catalog_value is Dictionary else {}
	for biome in BIOMES:
		var config: Dictionary=materials.get(biome,{})
		var ground: Dictionary=(config.get("slots",{}) as Dictionary).get("ground",{})
		terrain_material.set_shader_parameter("repeat_"+biome,clampf(float(ground.get("scale",200.0)),0.25,1000.0))
		terrain_material.set_shader_parameter("ground_opacity_"+biome,clampf(float(ground.get("opacity",1.0)),0.0,1.0))
		terrain_material.set_shader_parameter("biome_contrast_"+biome,clampf(float(config.get("colorContrast",1.0)),0.0,3.0))
		terrain_material.set_shader_parameter("biome_saturation_"+biome,clampf(float(config.get("colorSaturation",1.0)),0.0,3.0))
		var own: Dictionary=cliff_biomes.get(biome,{})
		var repeats:=float(own.get("repeats",0.0))
		if repeats<3.5 or repeats>315.0:
			if biome=="plains" and float(heights.get("period",0.0))>=2.0:
				repeats=630.0/float(heights.get("period",12.6))
			else:
				repeats=26.25
		terrain_material.set_shader_parameter("cliff_repeat_"+biome,repeats)
		terrain_material.set_shader_parameter("cliff_intensity_"+biome,
			clampf(float(own.get("intensity",1.0)),0.0,1.0) if _editor_cliff_color_enabled else 0.0)
	var art: Dictionary=source_world.get("handpaintMaterial",{})
	_editor_handpaint_opacity=clampf(float(art.get("opacity",0.50)),0.0,1.0)
	terrain_material.set_shader_parameter("handpaint_opacity",_editor_handpaint_opacity)
	terrain_material.set_shader_parameter("handpaint_contrast",clampf(float(art.get("contrast",0.45)),0.0,4.0))
	terrain_material.set_shader_parameter("handpaint_rotation_degrees",float(art.get("rotation",180.0)))
	terrain_material.set_shader_parameter("handpaint_blend_mode",int(art.get("blendMode",3)))
	var mix_data: Dictionary=source_world.get("groundMix",{})
	terrain_material.set_shader_parameter("ground_blend_mode",int(mix_data.get("mode",art.get("blendMode",3))))
	terrain_material.set_shader_parameter("ground_transparency",clampf(float(mix_data.get("opacity",1.0)),0.0,1.0))
	terrain_material.set_shader_parameter("handpaint_enabled",_editor_handpaint_enabled and handpaint_loaded)
	for item in _detail_materials:
		var biome:=str(item.get("biome",""))
		var layer:=int(item.get("layer",1))
		var layer_mat:=item.get("material") as ShaderMaterial
		if layer_mat==null:
			continue
		var config: Dictionary=materials.get(biome,{})
		var slot: Dictionary=(config.get("slots",{}) as Dictionary).get("detail"+str(layer),{})
		layer_mat.set_shader_parameter("repeats",clampf(float(slot.get("scale",200.0)),0.25,1000.0))
		layer_mat.set_shader_parameter("intensity",clampf(float(slot.get("opacity",0.5)),0.0,1.0))
		layer_mat.set_shader_parameter("variation_seed",float((config.get("noise",{}) as Dictionary).get("seed",1)))
		layer_mat.set_shader_parameter("biome_contrast",clampf(float(config.get("colorContrast",1.0)),0.0,3.0))
		layer_mat.set_shader_parameter("biome_saturation",clampf(float(config.get("colorSaturation",1.0)),0.0,3.0))
		var filename:=str(slot.get("name",""))
		var path:=str(catalog.get(filename,""))
		if path.begins_with("res://assets/textures/details/") and ResourceLoader.exists(path):
			var image:=load(path) as Texture2D
			if image!=null:
				layer_mat.set_shader_parameter("detail_texture",image)
	set_editor_details_visible(_editor_details_enabled)


func _add_models() -> void:
	var specs: Dictionary=_model_specs()
	var nodes: Array = source_world.get("nodes", [])
	for item in nodes:
		if not (item is Dictionary):
			continue
		var data: Dictionary = item
		var prefab_id: String = str(data.get("prefabId", ""))
		if str(data.get("kind", "")) != "prefab" or not specs.has(prefab_id):
			continue
		var model_data: Dictionary=specs[prefab_id]
		var glb_path:=str(model_data.get("path",""))
		if not glb_path.begins_with("res://assets/models/"):
			push_error("Unsafe prefab path")
			continue
		var packed := load(glb_path) as PackedScene
		if packed == null:
			push_error("Could not import GLB for " + prefab_id)
			continue
		var source: Node3D = packed.instantiate() as Node3D
		if source == null:
			continue
		var root := Node3D.new()
		root.name = "Prefab_%s_%s" % [prefab_id,str(data.get("id", ""))]
		root.set_meta("wildtrap_generated", true)
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
			var scale_factor: float = float(model_data.get("span",46.0))/longest if longest > 0.00001 else 1.0
			source.scale = Vector3.ONE*scale_factor
			source.position = Vector3(-(lower.x+upper.x)*0.5, -lower.y, -(lower.z+upper.z)*0.5)*scale_factor
		var x: float = float(data.get("x",0))
		var z: float = float(data.get("z",0))
		var y: float = float(data.get("y", _height_at(x,z)+float(data.get("offsetY",0))))
		root.position = Vector3(x,y+float(data.get("scaleAnchorOffsetY",0)),z)
		root.rotation_order = EULER_ORDER_YXZ
		root.rotation = Vector3(float(data.get("rotationX",0)),float(data.get("rotation",0)),float(data.get("rotationZ",0)))
		root.scale = Vector3.ONE*maxf(0.01,float(data.get("scale",1)))
		root.visible=not bool(data.get("editorHidden",false)) if Engine.is_editor_hint() else true
		for mesh_node in source.find_children("*", "MeshInstance3D", true, false):
			var part := mesh_node as MeshInstance3D
			part.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
			if Engine.is_editor_hint() and bool(data.get("editorIntangible",false)):
				part.transparency=0.76
