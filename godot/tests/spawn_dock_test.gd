extends SceneTree

func _initialize() -> void:
	call_deferred("_check")


func _check() -> void:
	if not Engine.is_editor_hint():
		_fail("Requires Godot --editor")
		return
	var scene := (load("res://scenes/main.tscn") as PackedScene).instantiate()
	root.add_child(scene)
	await process_frame
	await process_frame
	var script = load("res://addons/wildtrap_editor/dock.gd")
	var dock: Control = script.new()
	root.add_child(dock)
	dock.call("on_scene_changed",scene)
	var tabs := dock.find_child("WildTrapTabs",true,false) as TabContainer
	if tabs==null:
		_fail("Dock tabs missing")
		return
	tabs.current_tab=2
	var spawns := dock.find_child("Spawns",true,false) as ScrollContainer
	if spawns==null or spawns.get_v_scroll_bar()==null:
		_fail("Spawns page is not scrollable")
		return
	var world := scene.get_node_or_null("World") as Node3D
	var terrain := world.get_node_or_null("WildTrapTerrain") as MeshInstance3D
	var picking = load("res://addons/wildtrap_editor/spawn_viewport.gd")
	if terrain==null or picking==null:
		_fail("Cannot access native terrain")
		return
	# A real downward ray must hit the native triangle mesh, not a flat plane.
	var hit: Variant = picking.pick_mesh(Vector3(-50,250,55),Vector3.DOWN,terrain)
	if not (hit is Vector3):
		_fail("Native mesh ray picking returned no terrain")
		return
	dock.call("_set_spawn_mode","point")
	dock.call("spawn_world_click",Vector3(-80,80,25))
	var chosen: Dictionary = dock.call("_selected_spawn")
	if chosen.is_empty() or str(chosen.get("kind",""))!="spawnPoint" or str(chosen.get("category",""))!="unassigned":
		_fail("Native viewport click did not place an unassigned marker")
		return
	var marker_id := int(chosen.get("id",-1))
	# Repeated clicks create distinct placeholders; classification happens later.
	dock.call("spawn_world_click",Vector3(-65,80,28))
	var second: Dictionary=dock.call("_selected_spawn")
	if second.is_empty() or int(second.get("id",-1))==marker_id:
		_fail("Consecutive point clicks failed to create separate markers")
		return
	dock.call("_select_spawn",marker_id)
	var result: Dictionary=(dock.get("_store") as RefCounted).call("spawn_change_point_category",marker_id,"trees")
	if not bool(result.get("ok",false)):
		_fail("Could not assign category to selected marker")
		return
	dock.call("refresh_scene")
	if str((dock.call("_selected_spawn") as Dictionary).get("category",""))!="trees":
		_fail("Categorization of selected point not persisted in editor state")
		return
	dock.call("_set_spawn_mode","area")
	for p in [
		Vector3(80,0,80),Vector3(105,0,80),
		Vector3(105,0,105),Vector3(80,0,105)
	]:
		dock.call("spawn_world_click",p)
	dock.call("_close_spawn_polygon")
	var area: Dictionary = dock.call("_selected_spawn_area")
	if area.is_empty() or (area.get("points",[]) as Array).size()!=4:
		_fail("Area drawing did not close polygon")
		return
	var visual := world.get_node_or_null("__WildTrapSpawnOverlay")
	if visual==null or visual.owner!=null:
		_fail("Editor overlay missing or wrongly serialized")
		return
	dock.call("_set_spawn_mode","move_vertex")
	dock.call("spawn_world_click",Vector3(83,0,80))
	var updated: Dictionary = dock.call("_selected_spawn_area")
	if absf(float(updated["points"][0]["x"])-83)>0.01:
		_fail("Viewport vertex reposition failed")
		return
	# Dock tests must never save data into res://.
	print("WILDTRAP_SPAWN_DOCK_OK ray=true point=true closed_area=true move_vertex=true transient=true")
	dock.call("clear_spawn_preview")
	dock.queue_free()
	scene.queue_free()
	await process_frame
	quit(0)


func _fail(message: String) -> void:
	push_error("WILDTRAP_SPAWN_DOCK_FAILED: "+message)
	quit(1)
