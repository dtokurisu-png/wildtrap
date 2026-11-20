extends Node3D
## Visual review camera only. Player movement is not part of step 2.

@onready var camera: Camera3D = $Camera3D
@onready var world_environment: WorldEnvironment = $WorldEnvironment
var yaw := 0.0
var pitch := -0.43
var distance := 420.0
var target := Vector3(0.0, 65.0, 0.0)
var dragging := false

func _ready() -> void:
	camera.far = 3200.0
	_update_camera()
	print("WILDTRAP_GODOT_BOOT_OK")

func _process(_delta: float) -> void:
	_update_camera()

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		if event.button_index == MOUSE_BUTTON_RIGHT:
			dragging = event.pressed
		elif event.pressed and event.button_index == MOUSE_BUTTON_WHEEL_UP:
			distance = maxf(45.0, distance*0.88)
		elif event.pressed and event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			distance = minf(1600.0, distance*1.14)
	elif event is InputEventMouseMotion and dragging:
		yaw -= event.relative.x*0.005
		pitch = clampf(pitch-event.relative.y*0.005,-1.48,-0.08)
	elif event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_F:
			if world_environment.environment != null:
				world_environment.environment.fog_enabled = not world_environment.environment.fog_enabled
				print("WILDTRAP_INSPECT_FOG_ENABLED=", world_environment.environment.fog_enabled)
			return
		var movement := Vector3.ZERO
		match event.keycode:
			KEY_W: movement.z -= 30.0
			KEY_S: movement.z += 30.0
			KEY_A: movement.x -= 30.0
			KEY_D: movement.x += 30.0
		if movement != Vector3.ZERO:
			target += Basis(Vector3.UP,yaw)*movement

func _update_camera() -> void:
	var horizontal: float = cos(pitch)*distance
	camera.position = target+Vector3(sin(yaw)*horizontal,-sin(pitch)*distance,cos(yaw)*horizontal)
	camera.look_at(target,Vector3.UP)
