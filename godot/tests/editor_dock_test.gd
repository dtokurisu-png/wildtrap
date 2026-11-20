extends SceneTree
## Headless editor test for the Godot-native WildTrap Editor panel.
## Verifies real JSON values, safe marker ownership and functional controls.

func _initialize() -> void:
	call_deferred("_check")


func _check() -> void:
	if not Engine.is_editor_hint():
		_fail("Must run with --editor --script")
		return
	var packed := load("res://scenes/main.tscn") as PackedScene
	if packed == null:
		_fail("Missing main scene")
		return
	var scene := packed.instantiate()
	root.add_child(scene)
	await process_frame
	await process_frame
	var dock_script = load("res://addons/wildtrap_editor/dock.gd")
	if dock_script == null:
		_fail("Dock script missing")
		return
	var dock: Control = dock_script.new()
	root.add_child(dock)
	dock.call("on_scene_changed", scene)
	var summary: Dictionary = dock.call("debug_summary")
	if summary.get("zones", 0) != 16 or summary.get("spawns", 0) != 1:
		_fail("Unexpected source zones/spawns: " + JSON.stringify(summary))
		return
	if not bool(summary.get("world_found", false)):
		_fail("Panel did not find active scene World node")
		return
	var world := scene.get_node_or_null("World")
	if world == null or world.get_node_or_null("WildTrapTerrain") == null:
		_fail("Original terrain preview disappeared")
		return
	dock.call("_highlight_zone")
	var outline := world.get_node_or_null("__WildTrapZoneOutline")
	if outline == null or outline.owner != null:
		_fail("Missing transient biome outline or it became persistent")
		return
	dock.call("_highlight_spawn")
	var marker := world.get_node_or_null("__WildTrapSpawnMarker")
	if marker == null or marker.owner != null:
		_fail("Missing transient player spawn marker or it became persistent")
		return
	dock.call("_clear_marker")
	if world.get_node_or_null("__WildTrapSpawnMarker") != null:
		_fail("Spawn marker was not removed")
		return
	if str(summary.get("zone_info", "")).is_empty() or str(summary.get("terrain_info", "")).is_empty():
		_fail("Dock panels are missing their metadata")
		return
	print("WILDTRAP_EDITOR_DOCK_OK zones=16 spawns=1 preview=true")
	dock.queue_free()
	scene.queue_free()
	await process_frame
	quit(0)


func _fail(message: String) -> void:
	push_error("WILDTRAP_EDITOR_DOCK_FAILED: " + message)
	quit(1)
