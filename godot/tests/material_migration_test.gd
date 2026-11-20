extends SceneTree
## Material migration regression: assets are the exact main-branch textures.
## Test semantics and load references without making GPU screenshot claims.
func _initialize() -> void:
	call_deferred("_check")


func _check() -> void:
	var scene := (load("res://scenes/main.tscn") as PackedScene).instantiate()
	root.add_child(scene)
	await process_frame
	await process_frame
	var world := scene.get_node_or_null("World")
	if world==null:
		_fail("World node is missing")
		return
	var terrain := world.get_node_or_null("WildTrapTerrain") as MeshInstance3D
	if terrain==null:
		_fail("Terrain is missing")
		return
	var report: Dictionary=world.call("get_material_migration_summary")
	if int(report.get("detail_layers",0))!=15:
		_fail("Expected 5 biomes x 3 complement passes: "+JSON.stringify(report))
		return
	if int(report.get("cliff_masks",0))!=5 or not bool(report.get("handpaint",false)):
		_fail("Cliff masks or original hand-painted image not loaded: "+JSON.stringify(report))
		return
	if absf(float(report.get("handpaint_alpha",0))-0.50)>0.001:
		_fail("Original handpaint default 50% lost")
		return
	var surface_material:=terrain.material_override as ShaderMaterial
	if surface_material==null:
		_fail("Missing native terrain shader")
		return
	var handpaint:=surface_material.get_shader_parameter("handpaint_texture") as Texture2D
	if handpaint==null or handpaint.get_width()<1000 or handpaint.get_height()<1000:
		_fail("Missing original global hand-painted artwork")
		return
	var source: Dictionary=JSON.parse_string(FileAccess.get_file_as_string("res://data/world.json"))
	var cliff_settings: Dictionary=source.get("cliffHeightSettings",{})
	var map:=load("res://addons/wildtrap_editor/biome_masks.gd")
	var actual: Dictionary=map.make_cliff_biome_masks(source)
	var parent_ids: Dictionary={}
	for zone in source.get("zones",[]):
		if not bool(zone.get("isCliff",false)):
			parent_ids[str(zone.get("id",""))]=str(zone.get("biomeId",""))
	var cliff_areas:=0
	for cliff in source.get("zones",[]):
		if not bool(cliff.get("isCliff",false)):
			continue
		cliff_areas+=1
		var biome: String=str(parent_ids.get(str(cliff.get("cliffParentId","")),""))
		if biome.is_empty() or not actual.has(biome):
			_fail("Unassigned cliff parent biome: "+str(cliff.get("id","")))
			return
	if cliff_areas!=11:
		_fail("Not all original cliff areas are present")
		return
	for biome in ["forest","desert","plains","swamp","mountain"]:
		var mask: Texture2D=surface_material.get_shader_parameter("cliff_mask_"+biome)
		if mask==null:
			_fail("Missing painted cliff mask for "+biome)
			return
		var pixels:=mask.get_image()
		if pixels==null or pixels.get_width()!=512 or pixels.get_height()!=512:
			_fail("Wrong cliff mask size "+biome)
			return
		var has_pixels:=false
		for y in range(0,512,4):
			if has_pixels:
				break
			for x in range(0,512,4):
				if pixels.get_pixel(x,y).r>0.9:
					has_pixels=true
					break
		# All five biomes currently have at least one parent cliff region.
		if not has_pixels:
			_fail("Cliff mask was not painted for "+biome)
			return
	for biome in ["forest","desert","plains","swamp","mountain"]:
		for layer in range(1,4):
			var node_name: String="WildTrapDetail_%s_%d" % [biome,layer]
			var model:=world.get_node_or_null(node_name) as MeshInstance3D
			if model==null or model.mesh!=terrain.mesh or model.owner!=null:
				_fail("Complement node missing or persistent: "+node_name)
				return
			var material:=model.material_override as ShaderMaterial
			if material==null or material.get_shader_parameter("detail_texture")==null:
				_fail("No actual image bound to "+node_name)
				return
	print("WILDTRAP_MATERIAL_MIGRATION_OK detail=15 cliff=5 originals=15 handpaint=4k opacity=0.50")
	scene.queue_free()
	await process_frame
	quit(0)


func _fail(message: String) -> void:
	push_error("WILDTRAP_MATERIAL_MIGRATION_FAILED: "+message)
	quit(1)
