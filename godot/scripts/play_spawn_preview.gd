@tool
extends RefCounted
## One-shot editor-to-Play handoff. The editor writes the live J1 when F5 is
## pressed; the game reads it after verifying the source world fingerprint.
## No mesh, biome, object, or canonical world data is changed by this preview.
const WORLD_PATH := "res://data/world.json"
const PREVIEW_PATH := "user://wildtrap_j1_play_preview.json"


static func player_one(source: Dictionary) -> Dictionary:
	for entry in source.get("nodes",[]):
		if entry is Dictionary and str(entry.get("kind",""))=="playerSpawn" and int(entry.get("playerSlot",0))==1:
			return entry
	return {}


static func clear_preview() -> void:
	if FileAccess.file_exists(PREVIEW_PATH):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(PREVIEW_PATH))


static func prepare(source: Dictionary) -> bool:
	var j1 := player_one(source)
	if j1.is_empty():
		push_error("WildTrap Play: no está asignado el Jugador 1 (J1).")
		clear_preview()
		return false
	var x := float(j1.get("x",INF))
	var z := float(j1.get("z",INF))
	var half := float(source.get("size",630.0))*0.5
	if not is_finite(x) or not is_finite(z) or absf(x)>half or absf(z)>half:
		push_error("WildTrap Play: posición J1 fuera del terreno.")
		clear_preview()
		return false
	var payload := {
		"project":ProjectSettings.globalize_path("res://"),
		"world_md5":FileAccess.get_md5(WORLD_PATH),
		"player_slot":1,
		"x":x,
		"z":z,
	}
	var file := FileAccess.open(PREVIEW_PATH,FileAccess.WRITE)
	if file==null:
		push_error("WildTrap Play: no se pudo crear la vista previa J1.")
		return false
	file.store_string(JSON.stringify(payload))
	file.flush()
	file.close()
	return true


static func resolve(source: Dictionary) -> Dictionary:
	var disk := player_one(source).duplicate(true)
	disk["source"]="world.json"
	if not FileAccess.file_exists(PREVIEW_PATH):
		return disk
	var value: Variant=JSON.parse_string(FileAccess.get_file_as_string(PREVIEW_PATH))
	if not (value is Dictionary):
		return disk
	var preview: Dictionary=value
	if str(preview.get("project",""))!=ProjectSettings.globalize_path("res://"):
		return disk
	if str(preview.get("world_md5",""))!=FileAccess.get_md5(WORLD_PATH):
		return disk
	if int(preview.get("player_slot",0))!=1:
		return disk
	var x:=float(preview.get("x",INF))
	var z:=float(preview.get("z",INF))
	var half:=float(source.get("size",630.0))*0.5
	if not is_finite(x) or not is_finite(z) or absf(x)>half or absf(z)>half:
		return disk
	return {"kind":"playerSpawn","playerSlot":1,"x":x,"z":z,"source":"editor-preview"}
