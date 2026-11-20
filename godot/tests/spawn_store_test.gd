extends SceneTree
## Isolated fixture: writes only user://, never the tracked JSON.

func _initialize() -> void:
	call_deferred("_check")


func _check() -> void:
	var ops = load("res://addons/wildtrap_editor/spawn_rules.gd")
	var store_script = load("res://addons/wildtrap_editor/world_store.gd")
	if ops==null or store_script==null:
		_fail("Missing spawn operations")
		return
	var original := FileAccess.get_file_as_string("res://data/world.json")
	var temp := "user://spawn_store_validation.json"
	var abs_path := ProjectSettings.globalize_path(temp)
	var file := FileAccess.open(temp,FileAccess.WRITE)
	if file==null:
		_fail("Cannot create test fixture")
		return
	file.store_string(original)
	file.close()
	var store: RefCounted = store_script.new()
	store.source_path=temp
	store.save_masks=false
	if not store.open():
		_fail("Could not open fixture: "+store.last_error)
		return
	var old_nodes: Array = store.data["nodes"].duplicate(true)
	var invalid: Array = [
		{"x":0,"z":0},{"x":12,"z":12},{"x":0,"z":12},{"x":12,"z":0}
	]
	if bool(store.spawn_create_area(invalid).get("ok",false)) or store.dirty:
		_fail("Crossed polygon was accepted")
		return
	var player: Dictionary = store.spawn_place_point("player",12,18,2)
	if not player.get("ok",false):
		_fail("Could not add player J2: "+JSON.stringify(player))
		return
	var moved: Dictionary = store.spawn_place_point("player",15,19,2)
	if not moved.get("ok",false) or int(moved.get("id",-1))!=int(player.get("id",-2)):
		_fail("Player slot should move, never duplicate")
		return
	var npc: Dictionary = store.spawn_place_point("npc",17,22)
	var vegetation: Dictionary = store.spawn_place_point("trees",18,24)
	if not npc.get("ok",false) or not vegetation.get("ok",false):
		_fail("NPC or vegetation point missing")
		return
	for slot in range(3,7):
		if not store.spawn_place_point("player",float(slot*10),float(slot*13),slot).get("ok",false):
			_fail("Could not place J"+str(slot))
			return
	if store.spawn_place_point("player",0,0,7).get("ok",false):
		_fail("Accepted player slot 7")
		return
	var points: Array = [
		{"x":50.0,"z":50.0},{"x":80.0,"z":50.0},
		{"x":80.0,"z":80.0},{"x":50.0,"z":80.0}
	]
	var area: Dictionary = store.spawn_create_area(points)
	if not area.get("ok",false):
		_fail("Area creation failed: "+JSON.stringify(area))
		return
	var area_id := str(area.get("id",""))
	if not ops.contains(points,65,65) or ops.contains(points,0,0):
		_fail("Polygon selection containment failed")
		return
	if not store.spawn_change_area(area_id,"name","Bosque este").get("ok",false):
		_fail("Cannot rename area")
		return
	for change in [{"key":"type","value":"plants"},{"key":"biome","value":"forest"},{"key":"density","value":75},{"key":"hidden","value":true}]:
		if not store.spawn_change_area(area_id,str(change["key"]),change["value"]).get("ok",false):
			_fail("Area property update failed")
			return
	if store.spawn_change_area(area_id,"density",120).get("ok",false):
		_fail("Out of range density was accepted")
		return
	if store.spawn_move_vertex(area_id,1,51,80).get("ok",false):
		_fail("Crossing/degenerate vertex move accepted")
		return
	if not store.spawn_move_vertex(area_id,1,84,50).get("ok",false):
		_fail("Could not move one area vertex")
		return
	if not store.undo() or not store.redo():
		_fail("Spawn operations do not support undo/redo")
		return
	if FileAccess.get_file_as_string(temp)!=original:
		_fail("Unsaved spawn edits wrote to disk")
		return
	if not store.save():
		_fail("Save failed: "+store.last_error)
		return
	var persisted: Variant = JSON.parse_string(FileAccess.get_file_as_string(temp))
	if not (persisted is Dictionary):
		_fail("Persisted JSON is invalid")
		return
	var areas: Array = persisted.get("spawnAreas",[])
	if areas.size()!=1 or str(areas[0].get("name",""))!="Bosque este" or int(areas[0].get("density",0))!=75:
		_fail("Area properties were not persisted")
		return
	var all_nodes: Array = persisted.get("nodes",[])
	for old in old_nodes:
		var found := false
		for existing in all_nodes:
			if int(existing.get("id",-1))==int(old.get("id",-2)):
				found=true
				if existing!=old:
					_fail("Original node changed: "+str(old.get("id")))
					return
				break
		if not found:
			_fail("Existing cave or player node disappeared")
			return
	if not ops.validate_world(persisted) or FileAccess.get_file_as_string("res://data/world.json")!=original:
		_fail("Save lost data or modified the repository fixture")
		return
	DirAccess.remove_absolute(abs_path)
	print("WILDTRAP_SPAWN_STORE_OK players=6 npc=true vegetation=true polygon=true undo=true redo=true saved=true")
	quit(0)


func _fail(message: String) -> void:
	push_error("WILDTRAP_SPAWN_STORE_FAILED: "+message)
	quit(1)
