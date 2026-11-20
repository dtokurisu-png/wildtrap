extends SceneTree

func _initialize() -> void:
	var source: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://data/world.json"))
	if not (source is Dictionary):
		_fail("No readable source JSON")
		return
	if int(source.get("size",0)) != 630 or int(source.get("resolution",0)) != 129:
		_fail("World dimensions do not match original snapshot")
		return
	if (source.get("heights", []) as Array).size() != 16641:
		_fail("Expected 16641 terrain height samples")
		return
	if (source.get("cuts3d", []) as Array).size() != 6:
		_fail("Expected 6 source 3D cuts")
		return
	var f := FileAccess.open("res://data/terrain.wtmesh", FileAccess.READ)
	if f == null:
		_fail("Native world geometry not generated")
		return
	if f.get_buffer(4).get_string_from_ascii() != "WTG2" or f.get_32() != 1:
		_fail("Invalid native mesh magic/version")
		return
	var vertices := f.get_32()
	var indexes := f.get_32()
	if vertices < 16641 or indexes < 90000 or indexes%3 != 0:
		_fail("Native terrain geometry counts are incomplete")
		return
	if f.get_length() != 16+vertices*44+indexes*4:
		_fail("Native terrain mesh is truncated")
		return
	for biome in ["forest","desert","plains","swamp","mountain"]:
		if not FileAccess.file_exists("res://data/masks/%s.png" % biome):
			_fail("Missing biome mask: "+biome)
			return
	print("WILDTRAP_GODOT_WORLD_DATA_OK vertices=",vertices," triangles=",indexes/3)
	quit(0)

func _fail(message: String) -> void:
	push_error("WILDTRAP_GODOT_WORLD_DATA_FAILED: "+message)
	quit(1)
