extends SceneTree
## Isolated fixture under user:// verifies actual JSON writes without editing
## the committed source world during tests.

func _initialize() -> void:
	call_deferred("_check")


func _check() -> void:
	var store_script = load("res://addons/wildtrap_editor/world_store.gd")
	var rules = load("res://addons/wildtrap_editor/biome_rules.gd")
	if store_script==null or rules==null:
		_fail("Source store or generator missing")
		return
	var source := FileAccess.get_file_as_string("res://data/world.json")
	var temp := ProjectSettings.globalize_path("user://wildtrap_store_test.json")
	var f := FileAccess.open(temp,FileAccess.WRITE)
	if f==null:
		_fail("Could not create isolated fixture")
		return
	f.store_string(source)
	f.close()
	var store: RefCounted = store_script.new()
	store.source_path="user://wildtrap_store_test.json"
	store.save_masks=false
	if not store.open():
		_fail(store.last_error)
		return
	var original: Dictionary = store.data.duplicate(true)
	var options: Dictionary = rules.enumerate(store.data)
	if not options.get("ok",false) or (options.get("options",[]) as Array).size()!=96:
		_fail("Incorrect 96 native biome layouts")
		return
	var current := int(rules.current_index(store.data,options["options"]))
	var next := (current+1)%96
	if not store.apply_distribution(options["options"][next]):
		_fail("Could not apply a new biome layout")
		return
	if not store.dirty or FileAccess.get_file_as_string(temp)!=source:
		_fail("Edits must stay in memory until explicit Save")
		return
	if not store.undo() or rules.current_index(store.data,options["options"])!=current:
		_fail("Undo returned wrong biome layout")
		return
	if not store.redo() or rules.current_index(store.data,options["options"])!=next:
		_fail("Redo returned wrong biome layout")
		return
	if not store.save():
		_fail("Native file save failed: "+store.last_error)
		return
	var written: Variant = JSON.parse_string(FileAccess.get_file_as_string(temp))
	if not (written is Dictionary):
		_fail("Saved JSON could not be parsed")
		return
	var persisted_idx: int = rules.current_index(written,options["options"])
	var persisted_heights: int = (written.get("heights",[]) as Array).size()
	if persisted_idx!=next or persisted_heights!=16641:
		var persisted_biomes: Array = []
		for zone in rules.regions(written):
			persisted_biomes.append(zone.get("biomeId","?"))
		_fail("Save mismatch: expected_index="+str(next)+" persisted_index="+str(persisted_idx)+" original_index="+str(current)+" heights="+str(persisted_heights)+" expected_biomes="+str(options["options"][next])+" actual_biomes="+str(persisted_biomes))
		return
	if (written.get("nodes",[]) as Array).size()!=(original.get("nodes",[]) as Array).size():
		_fail("Save lost unrelated scene objects")
		return
	var central_count: int = (written.get("zones",[]) as Array).filter(func(z): return not z.get("isCliff",false)).size()
	if central_count!=5:
		_fail("Lost the original five main regions")
		return
	if FileAccess.get_file_as_string("res://data/world.json")!=source:
		_fail("Saved to tracked world instead of isolated fixture")
		return
	DirAccess.remove_absolute(temp)
	print("WILDTRAP_EDITOR_SAVE_OK options=96 undo=true redo=true native_json=true")
	quit(0)


func _fail(message: String) -> void:
	push_error("WILDTRAP_EDITOR_SAVE_FAILED: "+message)
	quit(1)
