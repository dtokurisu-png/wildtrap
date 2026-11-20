extends SceneTree
## Verifies that the SAME world loader runs while the Godot editor is active,
## without launching the game using F5. No screenshots or GPU requirement.

func _initialize() -> void:
	call_deferred("_test_editor_world")


func _test_editor_world() -> void:
	if not Engine.is_editor_hint():
		_fail("This test must run with Godot --editor --script")
		return
	var packed := load("res://scenes/main.tscn") as PackedScene
	if packed == null:
		_fail("main.tscn is missing")
		return
	var scene := packed.instantiate()
	root.add_child(scene)
	await process_frame
	await process_frame
	var world := scene.get_node_or_null("World")
	if world == null:
		_fail("Missing World node")
		return
	var terrain := world.get_node_or_null("WildTrapTerrain") as MeshInstance3D
	if terrain == null or terrain.mesh == null:
		_fail("Terrain was not generated in editor mode")
		return
	if terrain.owner != null:
		_fail("Editor preview must not be serialized into main.tscn")
		return
	if terrain.material_override == null:
		_fail("Editor preview is missing its biome shader")
		return
	var prefabs := 0
	for child in world.get_children():
		if child.name.begins_with("Prefab_"):
			prefabs += 1
			if child.owner != null:
				_fail("Prefab preview is unexpectedly persistent")
				return
	if prefabs < 3:
		_fail("Expected three original cave prefabs; found " + str(prefabs))
		return
	print("WILDTRAP_GODOT_EDITOR_PREVIEW_OK terrain=true prefabs=", prefabs)
	scene.queue_free()
	quit(0)


func _fail(message: String) -> void:
	push_error("WILDTRAP_GODOT_EDITOR_PREVIEW_FAILED: " + message)
	quit(1)
