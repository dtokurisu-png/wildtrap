extends SceneTree
## Godot native editor integration: persistent map data, controls and previews.

func _initialize() -> void:
	call_deferred("_check")


func _check() -> void:
	if not Engine.is_editor_hint():
		_fail("Must run --editor --script")
		return
	var packed := load("res://scenes/main.tscn") as PackedScene
	if packed==null:
		_fail("Missing main scene")
		return
	var scene := packed.instantiate()
	root.add_child(scene)
	await process_frame
	await process_frame
	var dock_script = load("res://addons/wildtrap_editor/dock.gd")
	if dock_script==null:
		_fail("No WildTrap dock")
		return
	var dock: Control = dock_script.new()
	root.add_child(dock)
	dock.call("on_scene_changed",scene)
	var summary: Dictionary = dock.call("debug_summary")
	if int(summary.get("zones",0))!=16 or int(summary.get("spawns",0))!=1:
		_fail("Source zones or spawns missing: "+JSON.stringify(summary))
		return
	if int(summary.get("distribution_count",0))!=96:
		_fail("Expected original 96 permutations: "+JSON.stringify(summary))
		return
	if not bool(summary.get("world_found",false)):
		_fail("Could not attach to World in scene")
		return
	var world := scene.get_node_or_null("World")
	if world==null or world.get_node_or_null("WildTrapTerrain")==null:
		_fail("Terrain preview not loaded")
		return
	dock.call("_select_biome","forest")
	var mesh: MeshInstance3D = world.get_node_or_null("WildTrapTerrain")
	var mat := mesh.material_override as ShaderMaterial
	if mat==null or int(mat.get_shader_parameter("selected_biome"))!=0:
		_fail("Biome surface selection was not applied to shader")
		return
	dock.call("_highlight_zone")
	var outline := world.get_node_or_null("__WildTrapZoneOutline")
	if outline==null or outline.owner!=null:
		_fail("Zone outline is not transient")
		return
	dock.call("_highlight_spawn")
	var marker := world.get_node_or_null("__WildTrapSpawnMarker")
	if marker==null or marker.owner!=null:
		_fail("Spawn marker is not transient")
		return
	dock.call("_clear_marker")
	if world.get_node_or_null("__WildTrapSpawnMarker")!=null:
		_fail("Marker cleanup failed")
		return
	if str(summary.get("terrain_info","")).is_empty():
		_fail("Biome dock data missing")
		return
	# All tabs must be fully scrollable, including zone list and pager.
	for page_name in ["Biomas","Zonas","Spawns"]:
		var scroll := dock.find_child(page_name,true,false) as ScrollContainer
		if scroll==null or scroll.vertical_scroll_mode!=ScrollContainer.SCROLL_MODE_SHOW_ALWAYS:
			_fail("Missing whole-panel vertical scrolling: "+page_name)
			return
		if scroll.get_v_scroll_bar()==null:
			_fail("No vertical scrollbar available: "+page_name)
			return
	var zone_scroll := dock.find_child("Zonas",true,false) as ScrollContainer
	if zone_scroll.find_child("DistributionPager",true,false)==null:
		_fail("Distribution pager is outside the scrollable zone page")
		return
	# Selecting a cliff highlights the real polygon in the terrain shader.
	dock.call("_choose_zone","zone-6")
	if not bool(mat.get_shader_parameter("selected_zone_enabled")):
		_fail("Cliff polygon selection did not reach terrain shader")
		return
	var zone_mask := mat.get_shader_parameter("selected_zone_mask") as Texture2D
	if zone_mask==null:
		_fail("No native selected cliff zone mask")
		return
	# Whole-cliff toggle must generate and use 11 source polygons.
	dock.call("_toggle_cliffs")
	if not bool(mat.get_shader_parameter("cliff_zones_enabled")):
		_fail("Mostrar acantilados did not enable the 3D cliff overlay")
		return
	var cliff_mask := mat.get_shader_parameter("cliff_zones_mask") as Texture2D
	if cliff_mask==null:
		_fail("Missing cliff area texture in shader")
		return
	var cliff_pixels := cliff_mask.get_image()
	var any_cliff := false
	for y in range(0,cliff_pixels.get_height(),3):
		if any_cliff:
			break
		for x in range(0,cliff_pixels.get_width(),3):
			if cliff_pixels.get_pixel(x,y).r>0.9:
				any_cliff=true
				break
	if not any_cliff:
		_fail("The cliff mask contains no selected polygons")
		return
	dock.call("_toggle_cliffs")
	if bool(mat.get_shader_parameter("cliff_zones_enabled")):
		_fail("Cliff overlay did not switch off")
		return
	print("WILDTRAP_EDITOR_DOCK_OK zones=16 spawns=1 distributions=96 scroll=true cliff_masks=true")
	dock.queue_free()
	scene.queue_free()
	await process_frame
	quit(0)


func _fail(message: String) -> void:
	push_error("WILDTRAP_EDITOR_DOCK_FAILED: "+message)
	quit(1)
