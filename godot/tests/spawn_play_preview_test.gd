extends SceneTree
## Regression: the editor can move J1 to a NEW unassigned point. Play must
## spawn at the live editor coordinates even before world.json is saved.
const SPAWNS=preload("res://addons/wildtrap_editor/spawn_rules.gd")
const PREVIEW=preload("res://scripts/play_spawn_preview.gd")


func _initialize() -> void:
	call_deferred("_check")


func _check() -> void:
	PREVIEW.clear_preview()
	var original_text:=FileAccess.get_file_as_string("res://data/world.json")
	var parsed: Variant=JSON.parse_string(original_text)
	if not (parsed is Dictionary):
		_fail("Invalid world.json")
		return
	var disk: Dictionary=parsed
	var original_j1: Dictionary=PREVIEW.player_one(disk)
	if original_j1.is_empty():
		_fail("Original J1 missing")
		return
	var working: Dictionary=disk.duplicate(true)
	var x:=72.25
	var z:=97.75
	var created: Dictionary=SPAWNS.place_point(working,"unassigned",x,z)
	if not bool(created.get("ok",false)):
		_fail("Could not place the alternative marker")
		return
	var new_id:=int(created.get("id",-1))
	var assigned: Dictionary=SPAWNS.change_point_category(working,new_id,"player",1)
	if not bool(assigned.get("ok",false)) or not SPAWNS.validate_world(working):
		_fail("Could not reassign the player role to new marker")
		return
	var old_id:=int(original_j1.get("id",-1))
	var old_is_unassigned:=false
	for node in working.get("nodes",[]):
		if node is Dictionary and int(node.get("id",-1))==old_id:
			old_is_unassigned=str(node.get("kind",""))=="spawnPoint" and str(node.get("category",""))=="unassigned"
	if not old_is_unassigned:
		_fail("Previous J1 marker was not preserved")
		return
	if not PREVIEW.prepare(working):
		_fail("Could not send unsaved editor J1 to Play")
		return
	var chosen: Dictionary=PREVIEW.resolve(disk)
	if absf(float(chosen.get("x",0))-x)>0.01 or absf(float(chosen.get("z",0))-z)>0.01:
		_fail("Play did not resolve the edited J1 preview")
		return
	if str(chosen.get("source",""))!="editor-preview":
		_fail("Player spawn source should be editor-preview")
		return
	var scene: Node3D=(load("res://scenes/main.tscn") as PackedScene).instantiate()
	root.add_child(scene)
	for i in range(10):
		await process_frame
	var player:=scene.get_node_or_null("Explorador1WT") as CharacterBody3D
	if player==null:
		_fail("Play did not instantiate the character")
		return
	var spawn: Vector3=player.initial_spawn
	if absf(spawn.x-x)>0.05 or absf(spawn.z-z)>0.05:
		_fail("Character spawned at old J1 after editor handoff: "+str(spawn))
		return
	if FileAccess.get_file_as_string("res://data/world.json")!=original_text:
		_fail("Temporary preview modified world.json")
		return
	scene.queue_free()
	await process_frame
	PREVIEW.clear_preview()
	print("WILDTRAP_J1_PLAY_PREVIEW_OK reassigned=true previous_preserved=true unsaved=true runtime=true")
	quit(0)


func _fail(message: String) -> void:
	PREVIEW.clear_preview()
	push_error("WILDTRAP_J1_PLAY_PREVIEW_FAILED: "+message)
	quit(1)
