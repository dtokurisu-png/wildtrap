extends SceneTree
## Headless integration: F5 must open at J1 with the ORIGINAL GLB, animation
## library and third-person chase framing; editor JSON must not be modified.

func _initialize() -> void:
	call_deferred("_check")


func _check() -> void:
	var world_path := "res://data/world.json"
	var original := FileAccess.get_file_as_string(world_path)
	var data: Variant = JSON.parse_string(original)
	if not (data is Dictionary):
		_fail("World data missing")
		return
	var expected_spawn: Dictionary = {}
	for item in data.get("nodes",[]):
		if item is Dictionary and str(item.get("kind",""))=="playerSpawn" and int(item.get("playerSlot",0))==1:
			expected_spawn=item
			break
	if expected_spawn.is_empty():
		_fail("Player J1 spawn missing")
		return
	var scene := (load("res://scenes/main.tscn") as PackedScene).instantiate()
	root.add_child(scene)
	for i in range(8):
		await process_frame
	var summary: Dictionary = scene.call("debug_play_summary")
	if not bool(summary.get("player_loaded",false)):
		_fail("Play did not instantiate the Explorer")
		return
	if int(summary.get("mesh_colliders",0))<4:
		_fail("Missing terrain or cave physics colliders: "+JSON.stringify(summary))
		return
	var player := scene.get_node_or_null("Explorador1WT") as CharacterBody3D
	var camera := scene.get_node_or_null("Camera3D") as Camera3D
	if player==null or camera==null or not camera.current:
		_fail("Third-person camera or player missing")
		return
	var info: Dictionary = player.call("debug_summary")
	if int(info.get("meshes",0))<1:
		_fail("Original Explorer GLB has no visible mesh: "+JSON.stringify(info))
		return
	if int(info.get("animation_count",0))<5:
		_fail("Explorer original idle/run clips not imported: "+JSON.stringify(info))
		return
	var spawn: Vector3 = info.get("spawn",Vector3.ZERO)
	if absf(spawn.x-float(expected_spawn.get("x",0)))>0.05 or absf(spawn.z-float(expected_spawn.get("z",0)))>0.05:
		_fail("Started outside player J1 spawn")
		return
	if camera.global_position.distance_to(player.global_position)>8.0:
		_fail("Camera still in original inspection position")
		return
	var forward: Vector3 = player.call("_movement_axes",1.0,0.0,0.0)
	var right: Vector3 = player.call("_movement_axes",0.0,1.0,0.0)
	var yaw_forward: Vector3 = player.call("_movement_axes",1.0,0.0,PI/2.0)
	if forward.distance_to(Vector3(0,0,-1))>0.0001 or right.distance_to(Vector3(1,0,0))>0.0001 or yaw_forward.distance_to(Vector3(1,0,0))>0.0001:
		_fail("WASD camera-relative movement doesn't match browser")
		return
	if absf(float(info.get("walk_speed",0))-1.9)>0.001 or absf(float(info.get("run_speed",0))-3.0)>0.001:
		_fail("Player speeds differ from Web playtest")
		return
	var collider:=player.get_node_or_null("WT_Capsule") as CollisionShape3D
	if collider==null or collider.shape==null:
		_fail("Player capsule collision missing")
		return
	if FileAccess.get_file_as_string(world_path)!=original:
		_fail("Play rewrote editor's saved world")
		return
	print("WILDTRAP_EXPLORER_PLAY_OK meshes=",info.get("meshes")," animations=",info.get("animation_count")," spawn=",spawn," chase=true physics=true")
	scene.queue_free()
	await process_frame
	quit(0)


func _fail(error_text: String) -> void:
	push_error("WILDTRAP_EXPLORER_PLAY_FAILED: "+error_text)
	quit(1)
