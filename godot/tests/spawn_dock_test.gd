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
	var hit: Variant = picking.pick_mesh(Vector3(170,250,170),Vector3.DOWN,terrain)
	if not (hit is Vector3):
		_fail("Native mesh ray picking returned no terrain")
		return
	# Exercise the same mouse-event entrypoint used by the editor viewport,
	# rather than only calling spawn_world_click() directly.
	var test_camera:=Camera3D.new()
	scene.add_child(test_camera)
	test_camera.global_position=hit+Vector3(0,60,80)
	test_camera.look_at(hit,Vector3.UP)
	test_camera.current=true
	await process_frame
	var screen: Vector2=test_camera.unproject_position(hit)
	var mouse_move:=InputEventMouseMotion.new()
	mouse_move.position=screen
	dock.call("_set_spawn_mode","point")
	dock.call("handle_spawn_viewport_input",test_camera,mouse_move)
	var cursor:=world.get_node_or_null("__WildTrapSpawnCursor") as Sprite3D
	if cursor==null:
		_fail("Punto button did not display its green marker on mouse movement")
		return
	if cursor.texture==null or cursor.texture.get_width()!=24 or cursor.texture.get_height()!=32:
		_fail("Spawn marker isn't the compact 24x32 R4 revision")
		return
	if not cursor.fixed_size:
		_fail("Spawn marker must preserve its apparent size across camera distance")
		return
	var version_header:=dock.find_child("WildTrapBuildVersion",true,false) as Label
	if version_header==null or version_header.text!="WILDTRAP EDITOR · VERSIÓN R6":
		_fail("Current build version must appear in the main editor header")
		return
	var marker_slider:=dock.find_child("SpawnMarkerSize",true,false) as HSlider
	if marker_slider==null:
		_fail("Spawn marker size slider is missing")
		return
	marker_slider.value=20.0
	var small_size: float=cursor.pixel_size
	marker_slider.value=80.0
	if not is_equal_approx(cursor.pixel_size,small_size*4.0):
		_fail("Marker slider did not resize the live green cursor")
		return
	var overlay_node:=world.get_node_or_null("__WildTrapSpawnOverlay")
	if overlay_node==null:
		_fail("Spawn overlay is missing")
		return
	for child in overlay_node.get_children():
		if child is Sprite3D and not is_equal_approx((child as Sprite3D).pixel_size,cursor.pixel_size):
			_fail("Marker slider did not update an existing marker")
			return
	marker_slider.value=35.0
	var original_count: int=(dock.get("_store") as RefCounted).get("data").get("nodes",[]).size()
	var click:=InputEventMouseButton.new()
	click.button_index=MOUSE_BUTTON_LEFT
	click.pressed=true
	click.position=screen
	if not bool(dock.call("handle_spawn_viewport_input",test_camera,click)):
		_fail("Editor viewport left-click was not handled by Punto")
		return
	var current_count: int=(dock.get("_store") as RefCounted).get("data").get("nodes",[]).size()
	if current_count!=original_count+1:
		_fail("Mouse event did not persist an unassigned marker in editor state")
		return
	# Click and drag that same marker, releasing at another terrain hit.
	var marker: Dictionary=dock.call("_selected_spawn")
	var marker_id:=int(marker.get("id",-1))
	var mark_world:=Vector3(float(marker.get("x",0)),float(hit.y)+4.0,float(marker.get("z",0)))
	var mark_screen: Vector2=test_camera.unproject_position(mark_world)
	click.position=mark_screen
	if not bool(dock.call("handle_spawn_viewport_input",test_camera,click)):
		_fail("Clicking a marker did not activate selection/drag")
		return
	var offset: Vector3=hit+Vector3(7,0,0)
	var drag:=InputEventMouseMotion.new()
	drag.position=test_camera.unproject_position(offset)
	dock.call("handle_spawn_viewport_input",test_camera,drag)
	var release:=InputEventMouseButton.new()
	release.button_index=MOUSE_BUTTON_LEFT
	release.pressed=false
	release.position=drag.position
	if not bool(dock.call("handle_spawn_viewport_input",test_camera,release)):
		_fail("Marker release was not handled")
		return
	var moved: Dictionary=dock.call("_selected_spawn")
	if int(moved.get("id",-1))!=marker_id or absf(float(moved.get("x",0))-float(marker.get("x",0)))<1.0:
		_fail("Click-drag did not move the selected spawn marker")
		return
	dock.call("_set_spawn_mode","point")
	dock.call("spawn_world_click",Vector3(-80,80,25))
	var chosen: Dictionary = dock.call("_selected_spawn")
	if chosen.is_empty() or str(chosen.get("kind",""))!="spawnPoint" or str(chosen.get("category",""))!="unassigned":
		_fail("Native viewport click did not place an unassigned marker")
		return
	var second_marker_id := int(chosen.get("id",-1))
	# Repeated clicks create distinct placeholders; classification happens later.
	dock.call("spawn_world_click",Vector3(-65,80,28))
	var second: Dictionary=dock.call("_selected_spawn")
	if second.is_empty() or int(second.get("id",-1))==second_marker_id:
		_fail("Consecutive point clicks failed to create separate markers")
		return
	dock.call("_select_spawn",second_marker_id)
	var result: Dictionary=(dock.get("_store") as RefCounted).call("spawn_change_point_category",second_marker_id,"trees")
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
