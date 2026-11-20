@tool
extends EditorPlugin

const DOCK_SCRIPT = preload("res://addons/wildtrap_editor/dock.gd")

var wildtrap_dock: Control

func _enter_tree() -> void:
	wildtrap_dock = DOCK_SCRIPT.new()
	wildtrap_dock.name = "WildTrap Editor"
	wildtrap_dock.set_editor_interface(get_editor_interface())
	add_control_to_dock(DOCK_SLOT_RIGHT_BL, wildtrap_dock)
	scene_changed.connect(_on_scene_changed)
	call_deferred("_sync_current_scene")
	print("WILDTRAP_EDITOR_PLUGIN_READY")


func _sync_current_scene() -> void:
	if wildtrap_dock != null and is_instance_valid(wildtrap_dock):
		wildtrap_dock.on_scene_changed(get_editor_interface().get_edited_scene_root())


func _on_scene_changed(root: Node) -> void:
	if wildtrap_dock != null and is_instance_valid(wildtrap_dock):
		wildtrap_dock.on_scene_changed(root)


func _exit_tree() -> void:
	if wildtrap_dock != null and is_instance_valid(wildtrap_dock):
		remove_control_from_docks(wildtrap_dock)
		wildtrap_dock.queue_free()
	wildtrap_dock = null
