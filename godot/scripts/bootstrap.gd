extends Node3D
## Minimal native entry point. Does not replace or reconstruct the original map.
## All real level content will be loaded under the World node in a later stage.

@onready var camera: Camera3D = $Camera3D


func _ready() -> void:
	camera.position = Vector3(0.0, 28.0, 36.0)
	camera.look_at(Vector3.ZERO, Vector3.UP)
	print("WILDTRAP_GODOT_BOOT_OK")
