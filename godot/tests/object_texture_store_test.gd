extends SceneTree
## Isolated native JSON regression; never alters the repository's real world.
func _initialize() -> void:
	call_deferred("_check")


func _check() -> void:
	var store: RefCounted=load("res://addons/wildtrap_editor/world_store.gd").new()
	var original:=FileAccess.get_file_as_string("res://data/world.json")
	var tmp:="user://wildtrap_object_texture_test.json"
	var f:=FileAccess.open(tmp,FileAccess.WRITE)
	if f==null:
		_fail("Cannot create temporary file")
		return
	f.store_string(original)
	f.close()
	store.source_path=tmp
	store.save_masks=false
	if not store.open():
		_fail("Cannot open existing world JSON: "+store.last_error)
		return
	var before_nodes: Array=store.data.get("nodes",[]).duplicate(true)
	var place: Dictionary=store.object_place("rock-pillar-4",120.0,35.0)
	if not bool(place.get("ok",false)):
		_fail("Native model placement rejected: "+JSON.stringify(place))
		return
	var id_num:=int(place.get("id",-1))
	if not bool(store.object_edit(id_num,"scale",1.7).get("ok",false)):
		_fail("Object scale failed")
		return
	if not bool(store.object_edit(id_num,"editorHidden",true).get("ok",false)):
		_fail("Object hide toggle failed")
		return
	if bool(store.object_place("invalid-model",0,0).get("ok",false)):
		_fail("Unknown prefab accepted")
		return
	if not store.set_material_values("plains","ground",{"scale":225,"opacity":0.9,"colorContrast":1.4,"colorSaturation":1.1}):
		_fail("Native ground material settings failed")
		return
	if not store.set_material_values("plains","cliff",{"scale":68.5,"opacity":0.71}):
		_fail("Native cliff material settings failed")
		return
	if not store.set_material_values("plains","detail2",{"scale":125,"opacity":0.31,"name":"Parche de hierba seca pintada.png","colorContrast":1.4,"colorSaturation":1.1}):
		_fail("Detail texture selection failed: "+store.last_error)
		return
	if not store.set_handpaint_values({"opacity":0.66,"rotation":36,"contrast":0.8,"blendMode":3}):
		_fail("Global handpainting settings failed")
		return
	if not store.undo() or not store.redo():
		_fail("Material settings are not undoable")
		return
	if FileAccess.get_file_as_string(tmp)!=original:
		_fail("Changes written before pressing Save")
		return
	if not store.save():
		_fail("Native save refused: "+store.last_error)
		return
	var written: Dictionary=JSON.parse_string(FileAccess.get_file_as_string(tmp))
	var record: Dictionary={}
	for node in written.get("nodes",[]):
		if node is Dictionary and int(node.get("id",-1))==id_num:
			record=node
	if record.is_empty() or str(record.get("prefabId",""))!="rock-pillar-4":
		_fail("Persisted placed model is missing")
		return
	var p: Dictionary=written["biomeMaterials"]["plains"]
	if not is_equal_approx(float(p["slots"]["ground"]["scale"]),225.0):
		_fail("Base texture scale not persisted")
		return
	if str(p["slots"]["detail2"]["name"])!="Parche de hierba seca pintada.png":
		_fail("Complementary image choice not persisted")
		return
	if not is_equal_approx(float(written["cliffHeightSettings"]["biomes"]["plains"]["repeats"]),68.5):
		_fail("Cliff repeat not persisted")
		return
	if not is_equal_approx(float(written["handpaintMaterial"]["opacity"]),0.66):
		_fail("Handpaint opacity not persisted")
		return
	for old in before_nodes:
		var found:=false
		for node in written.get("nodes",[]):
			if node is Dictionary and node.get("id")==old.get("id"):
				found=true
				if JSON.stringify(old,"",true,true)!=JSON.stringify(node,"",true,true):
					_fail("Existing prefab changed unexpectedly: "+str(old.get("id")))
					return
				break
		if not found:
			_fail("An existing scene node disappeared")
			return
	if FileAccess.get_file_as_string("res://data/world.json")!=original:
		_fail("Real project world overwritten during test")
		return
	DirAccess.remove_absolute(ProjectSettings.globalize_path(tmp))
	print("WILDTRAP_OBJECT_TEXTURE_STORE_OK model=true texture=true cliff=true handpaint=true save=true undo=true")
	quit(0)


func _fail(message: String) -> void:
	push_error("WILDTRAP_OBJECT_TEXTURE_STORE_FAILED: "+message)
	quit(1)
