@tool
extends RefCounted
## The Godot JSON is canonical. Retain unknown fields and full sculpt metadata.
## No writes on selection; explicit save only, with external modification check.
const PATH := "res://data/world.json"
const RULES = preload("res://addons/wildtrap_editor/biome_rules.gd")
const MASKS = preload("res://addons/wildtrap_editor/biome_masks.gd")
const HISTORY_LIMIT := 40

var data: Dictionary = {}
var _disk_hash := ""
var _undo: Array = []
var _redo: Array = []
var dirty := false
var last_error := ""


func open() -> bool:
	var path := ProjectSettings.globalize_path(PATH)
	if not FileAccess.file_exists(path):
		last_error="Falta el mapa de Godot: "+PATH
		return false
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if not (parsed is Dictionary) or not _valid_map(parsed):
		last_error="JSON inválido; se mantiene el estado anterior."
		return false
	data=parsed
	_disk_hash=FileAccess.get_sha256(path)
	_undo.clear()
	_redo.clear()
	dirty=false
	last_error=""
	return true


func _valid_map(world: Dictionary) -> bool:
	var n := int(world.get("resolution",0))
	return n==129 and int(world.get("size",0))==630 and (world.get("heights",[]) as Array).size()==n*n and (world.get("zones",[]) as Array).size()>=5


func apply_distribution(distribution: Array) -> bool:
	var next: Dictionary = data.duplicate(true)
	if not RULES.apply_distribution(next, distribution):
		last_error="Distribución inválida o ya aplicada."
		return false
	_record()
	data=next
	dirty=true
	last_error=""
	return true


func _record() -> void:
	_undo.append(data.duplicate(true))
	if _undo.size()>HISTORY_LIMIT:
		_undo.pop_front()
	_redo.clear()


func can_undo() -> bool:
	return not _undo.is_empty()


func can_redo() -> bool:
	return not _redo.is_empty()


func undo() -> bool:
	if _undo.is_empty():
		return false
	_redo.append(data.duplicate(true))
	data=_undo.pop_back()
	dirty=true
	return true


func redo() -> bool:
	if _redo.is_empty():
		return false
	_undo.append(data.duplicate(true))
	data=_redo.pop_back()
	dirty=true
	return true


func save() -> bool:
	if not dirty:
		last_error="No hay cambios pendientes."
		return false
	if not _valid_map(data):
		last_error="El mapa no cumple el esquema original."
		return false
	var path := ProjectSettings.globalize_path(PATH)
	if FileAccess.get_sha256(path)!=_disk_hash:
		last_error="El archivo cambió fuera de Godot. No se sobrescribió; revisa GitHub Desktop antes de recargar."
		return false
	# Validate distributions and biome rules before touching the canonical file.
	var enumeration: Dictionary = RULES.enumerate(data)
	if not enumeration.get("ok",false) or RULES.current_index(data,enumeration.get("options",[]))<0:
		last_error="La distribución de biomas no cumple las restricciones."
		return false
	var text_data := JSON.stringify(data)
	var temp_path := path+".tmp"
	var file := FileAccess.open(temp_path,FileAccess.WRITE)
	if file==null:
		last_error="No se pudo preparar el guardado: "+str(FileAccess.get_open_error())
		return false
	file.store_string(text_data+"\n")
	file.flush()
	file.close()
	var verify: Variant = JSON.parse_string(FileAccess.get_file_as_string(temp_path))
	if not (verify is Dictionary) or not _valid_map(verify):
		DirAccess.remove_absolute(temp_path)
		last_error="Error de verificación del JSON temporal."
		return false
	var masks: Dictionary = MASKS.make(data)
	if not MASKS.save_pngs(masks):
		DirAccess.remove_absolute(temp_path)
		last_error="No se pudieron guardar todas las máscaras."
		return false
	var moved := DirAccess.rename_absolute(temp_path,path)
	if moved!=OK:
		DirAccess.remove_absolute(temp_path)
		last_error="No se pudo confirmar el JSON ("+str(moved)+")."
		return false
	_disk_hash=FileAccess.get_sha256(path)
	dirty=false
	_undo.clear()
	_redo.clear()
	last_error=""
	return true
