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
	print("WILDTRAP_EDITOR_DOCK_OK zones=16 spawns=1 distributions=96 surface_tint=true")
	dock.queue_free()
	scene.queue_free()
	await process_frame
	quit(0)


func _fail(message: String) -> void:
	push_error("WILDTRAP_EDITOR_DOCK_FAILED: "+message)
	quit(1)
