extends SceneTree
## Load the native project as a real PackedScene and validate key scene nodes.

func _initialize() -> void:
	if str(ProjectSettings.get_setting("application/config/name", "")) != "WildTrap":
		_fail("Project name is missing")
		return

	var packed: PackedScene = load("res://scenes/main.tscn") as PackedScene
	if packed == null:
		_fail("Main scene could not be loaded")
		return

	var instance: Node = packed.instantiate()
	if not (instance is Node3D):
		if instance != null:
			instance.free()
		_fail("Main scene root must be Node3D")
		return

	for path in ["World", "Camera3D", "Sun", "WorldEnvironment"]:
		if instance.get_node_or_null(NodePath(path)) == null:
			instance.free()
			_fail("Missing required scene node: " + path)
			return

	instance.free()
	print("WILDTRAP_GODOT_SMOKE_OK")
	quit(0)


func _fail(message: String) -> void:
	push_error("WILDTRAP_GODOT_SMOKE_FAILED: " + message)
	quit(1)
