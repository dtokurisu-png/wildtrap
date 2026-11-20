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
	var per_biome: Dictionary={}
	for cliff in source.get("zones",[]):
		if not bool(cliff.get("isCliff",false)):
			continue
		cliff_areas+=1
		var biome: String=str(parent_ids.get(str(cliff.get("cliffParentId","")),""))
		if biome.is_empty() or not actual.has(biome):
			_fail("Unassigned cliff parent biome: "+str(cliff.get("id","")))
			return
		per_biome[biome]=int(per_biome.get(biome,0))+1
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
		# If a parent biome has no cliffs, its mask MUST stay empty.
		var should_have:=int(per_biome.get(biome,0))>0
		if has_pixels!=should_have:
			_fail("Cliff mask classification mismatch "+biome+" parents="+str(per_biome.get(biome,0)))
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
	# Independent editor comparisons: each switch must affect real render data.
	world.call("set_editor_details_visible",false)
	var first_detail:=world.get_node_or_null("WildTrapDetail_forest_1") as MeshInstance3D
	if first_detail==null or first_detail.visible:
		_fail("Complementary details cannot be hidden for comparison")
		return
	world.call("set_editor_details_visible",true)
	if not first_detail.visible:
		_fail("Complementary detail restore failed")
		return
	world.call("set_editor_handpaint_visible",false)
	if bool(surface_material.get_shader_parameter("handpaint_enabled")):
		_fail("Hand painting cannot be disabled")
		return
	world.call("set_editor_handpaint_visible",true)
	world.call("set_editor_handpaint_opacity",0.73)
	if absf(float(surface_material.get_shader_parameter("handpaint_opacity"))-0.73)>0.001:
		_fail("Handpainting opacity slider is not reaching material")
		return
	world.call("set_editor_handpaint_opacity",0.50)
	world.call("set_editor_cliff_colors_visible",false)
	if float(surface_material.get_shader_parameter("cliff_intensity_plains"))>0.001:
		_fail("Cliff colors cannot be disabled")
		return
	world.call("set_editor_cliff_colors_visible",true)
	if float(surface_material.get_shader_parameter("cliff_intensity_plains"))<0.80:
		_fail("Original cliff intensity did not restore")
		return
	print("WILDTRAP_MATERIAL_MIGRATION_OK detail=15 cliff=5 originals=15 handpaint=4k opacity=0.50 toggles=true")
	scene.queue_free()
	await process_frame
	quit(0)


func _fail(message: String) -> void:
	push_error("WILDTRAP_MATERIAL_MIGRATION_FAILED: "+message)
	quit(1)
