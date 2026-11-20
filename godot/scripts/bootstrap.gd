extends Node3D
## Play mode: Explorer 1 WT with original chase camera. In Godot editor mode
## this script never creates player or collisions and does not affect the scene.
const EXPLORER = preload("res://scripts/explorer_controller.gd")

@onready var camera: Camera3D = $Camera3D
@onready var world: Node3D = $World
@onready var world_environment: WorldEnvironment = $WorldEnvironment
@onready var status: Label = $CanvasLayer/StatusLabel

var player: CharacterBody3D
var collision_count: int = 0


func _ready() -> void:
	camera.far = 1400.0
	_install_play_colliders()
	call_deferred("_start_explorer")
	print("WILDTRAP_GODOT_BOOT_OK")


func _install_play_colliders() -> void:
	# The original Web playtest collides with the CUT mesh, not the old
	# uncut heightmap. Godot trimesh shapes use exactly the rendered surfaces.
	var terrain := world.get_node_or_null("WildTrapTerrain") as MeshInstance3D
	if terrain != null:
		_attach_mesh_collider(terrain)
	for child in world.get_children():
		if not child.name.begins_with("Prefab_") or not child is Node3D or not child.visible:
			continue
		var intangible:=false
		var id_suffix:=str(child.name).get_slice("_",str(child.name).get_slice_count("_")-1)
		for node in world.source_world.get("nodes",[]):
			if node is Dictionary and str(node.get("kind",""))=="prefab" and str(node.get("id",""))==id_suffix:
				intangible=bool(node.get("editorIntangible",false))
				break
		if intangible:
			continue
		for piece in child.find_children("*", "MeshInstance3D", true, false):
			var model := piece as MeshInstance3D
			if model != null and model.mesh != null and model.visible and model.transparency < 0.75:
				_attach_mesh_collider(model)
	print("WILDTRAP_PLAY_COLLIDERS ", collision_count)


func _attach_mesh_collider(model: MeshInstance3D) -> void:
	if model.mesh == null or model.mesh.get_surface_count() < 1:
		return
	var shape := model.mesh.create_trimesh_shape()
	if shape is ConcavePolygonShape3D:
		# Cave wall interiors must collide from either side.
		(shape as ConcavePolygonShape3D).backface_collision = true
	if shape == null:
		return
	var body := StaticBody3D.new()
	body.name = "WT_PlayCollider"
	body.collision_layer = 1
	body.collision_mask = 0
	var collision := CollisionShape3D.new()
	collision.name = "Shape"
	collision.shape = shape
	body.add_child(collision)
	model.add_child(body)
	collision_count += 1


func _start_explorer() -> void:
	if not is_instance_valid(world) or world.get_node_or_null("WildTrapTerrain") == null:
		push_error("WildTrap: no hay escenario para iniciar Explorador 1 WT.")
		return
	player = EXPLORER.new() as CharacterBody3D
	player.initialize(camera, world)
	add_child(player)
	status.text = "WILDTRAP · Explorador 1 WT   |   WASD: moverse   |   Shift: correr   |   Arrastrar ratón: cámara"
	status.mouse_filter = Control.MOUSE_FILTER_IGNORE
	print("WILDTRAP_PLAY_STARTED")


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_F:
		if world_environment.environment != null:
			world_environment.environment.fog_enabled = not world_environment.environment.fog_enabled
			print("WILDTRAP_PLAY_FOG_ENABLED=", world_environment.environment.fog_enabled)


func debug_play_summary() -> Dictionary:
	return {"player_loaded": is_instance_valid(player),
		"mesh_colliders": collision_count,
		"spawn": player.initial_spawn if is_instance_valid(player) else Vector3.ZERO,
		"player_data": player.debug_summary() if is_instance_valid(player) else {}}
