@tool
extends VBoxContainer
## A safe read-only phase of the WildTrap native editor.
## It never writes JSON or creates scene-owned preview geometry.

const WORLD_FILE := "res://data/world.json"
const BUILD_FILE := "res://data/world-build.json"
const BIOME_LABELS := {
	"forest": "Bosque", "desert": "Desierto", "plains": "Pradera",
	"swamp": "Pantano", "mountain": "Montaña"
}

var _editor_interface: EditorInterface
var _scene_root: Node
var _source: Dictionary = {}
var _build_report: Dictionary = {}
var _zone_ids: Array[String] = []
var _spawn_ids: Array[int] = []
var _current_zone_id: String = ""
var _current_spawn_id: int = -1
var _marker: Node3D

var _status: Label
var _terrain_info: Label
var _preview_check: CheckButton
var _zone_picker: OptionButton
var _zone_info: Label
var _spawn_picker: OptionButton
var _spawn_info: Label


func _init() -> void:
	custom_minimum_size = Vector2(285, 280)
	size_flags_vertical = Control.SIZE_EXPAND_FILL


func set_editor_interface(value: EditorInterface) -> void:
	_editor_interface = value


func _ready() -> void:
	_build_panel()
	refresh_scene()


func on_scene_changed(root: Node) -> void:
	_clear_marker()
	_scene_root = root
	refresh_scene()


func _get_world() -> Node3D:
	if not is_instance_valid(_scene_root):
		return null
	return _scene_root.get_node_or_null("World") as Node3D


func _read_dictionary(file: String) -> Dictionary:
	if not FileAccess.file_exists(file):
		return {}
	var result: Variant = JSON.parse_string(FileAccess.get_file_as_string(file))
	if result is Dictionary:
		return result
	return {}


func _build_panel() -> void:
	var header := Label.new()
	header.text = "WILDTRAP EDITOR"
	header.add_theme_font_size_override("font_size", 17)
	add_child(header)
	_status = _label(self, "Cargando escenario...")
	var tabs := TabContainer.new()
	tabs.name = "WildTrapTabs"
	tabs.size_flags_vertical = Control.SIZE_EXPAND_FILL
	add_child(tabs)

	var terrain_tab := _tab(tabs, "Terreno")
	_terrain_info = _label(terrain_tab, "")
	_preview_check = CheckButton.new()
	_preview_check.name = "PreviewToggle"
	_preview_check.text = "Mostrar mundo en editor"
	_preview_check.toggled.connect(_on_preview_toggled)
	terrain_tab.add_child(_preview_check)
	_button(terrain_tab, "Seleccionar World", _select_world)
	_button(terrain_tab, "Actualizar vista 3D", _rebuild_preview)
	_button(terrain_tab, "Actualizar datos", refresh_scene)
	_label(terrain_tab, "Esta vista utiliza los datos publicados; no modifica el JSON.")

	var biomes_tab := _tab(tabs, "Biomas")
	_zone_picker = OptionButton.new()
	_zone_picker.name = "ZonePicker"
	_zone_picker.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_zone_picker.item_selected.connect(_on_zone_selected)
	biomes_tab.add_child(_zone_picker)
	_zone_info = _label(biomes_tab, "")
	_button(biomes_tab, "Resaltar zona en 3D", _highlight_zone)
	_button(biomes_tab, "Ocultar marca", _clear_marker)
	_label(biomes_tab, "Las marcas son solo una ayuda visual, no se guardan.")

	var spawns_tab := _tab(tabs, "Spawns")
	_spawn_picker = OptionButton.new()
	_spawn_picker.name = "SpawnPicker"
	_spawn_picker.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_spawn_picker.item_selected.connect(_on_spawn_selected)
	spawns_tab.add_child(_spawn_picker)
	_spawn_info = _label(spawns_tab, "")
	_button(spawns_tab, "Marcar spawn en 3D", _highlight_spawn)
	_button(spawns_tab, "Ocultar marca", _clear_marker)
	_label(spawns_tab, "La edición persistente de coordenadas vendrá después.")


func _tab(parent: TabContainer, name_text: String) -> VBoxContainer:
	var body := VBoxContainer.new()
	body.name = name_text
	body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	parent.add_child(body)
	return body


func _label(parent: Node, content: String) -> Label:
	var label := Label.new()
	label.text = content
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	parent.add_child(label)
	return label


func _button(parent: Node, title_text: String, callback: Callable) -> Button:
	var button := Button.new()
	button.text = title_text
	button.pressed.connect(callback)
	parent.add_child(button)
	return button


func refresh_scene() -> void:
	if _terrain_info == null:
		return
	_source = _read_dictionary(WORLD_FILE)
	_build_report = _read_dictionary(BUILD_FILE)
	var world := _get_world()
	_status.text = "Escena main.tscn" if world != null else "Abre scenes/main.tscn para inspeccionar"
	_preview_check.set_pressed_no_signal(world != null and bool(world.get("preview_in_editor")))
	_preview_check.disabled = world == null
	var heights: Array = _source.get("heights", [])
	var zones: Array = _source.get("zones", [])
	var nodes: Array = _source.get("nodes", [])
	var cuts: Array = _source.get("cuts3d", [])
	var offsets: Dictionary = _source.get("terrainVertexOffsets", {})
	var counts := "%s × %s unidades\nAlturas: %d\nVértices desplazados: %d\nCortes 3D: %d" % [
		str(_source.get("size", "—")), str(_source.get("size", "—")),
		heights.size(), offsets.size(), cuts.size()
	]
	if world != null:
		counts += "\nMalla en editor: %d vértices, %d triángulos" % [
			int(world.get("vertex_count")), int(world.get("triangle_count"))
		]
	else:
		counts += "\nMalla horneada: %d vértices, %d triángulos" % [
			int(_build_report.get("vertices", 0)), int(_build_report.get("triangles", 0))
		]
	_terrain_info.text = counts
	_populate_zones(zones)
	_populate_spawns(nodes, _source.get("spawnAreas", []))


func _populate_zones(zones: Array) -> void:
	_zone_ids.clear()
	_zone_picker.clear()
	for candidate in zones:
		if not (candidate is Dictionary):
			continue
		var zone: Dictionary = candidate
		if not (zone.get("points", []) is Array):
			continue
		var identifier := str(zone.get("id", ""))
		if identifier.is_empty():
			continue
		_zone_ids.append(identifier)
		var prefix := "⛰ " if bool(zone.get("isCliff", false)) else ""
		var biome := str(zone.get("biomeId", "sin bioma"))
		_zone_picker.add_item(prefix + str(zone.get("name", identifier)) + " · " + str(BIOME_LABELS.get(biome, biome)))
	if _zone_ids.is_empty():
		_current_zone_id = ""
		_zone_info.text = "No se encontraron zonas."
		return
	var index := _zone_ids.find(_current_zone_id)
	if index < 0:
		index = 0
	_current_zone_id = _zone_ids[index]
	_zone_picker.select(index)
	_update_zone_info()


func _on_zone_selected(index: int) -> void:
	if index < 0 or index >= _zone_ids.size():
		return
	_current_zone_id = _zone_ids[index]
	_update_zone_info()
	_highlight_zone()


func _selected_zone() -> Dictionary:
	for entry in _source.get("zones", []):
		if entry is Dictionary and str(entry.get("id", "")) == _current_zone_id:
			return entry
	return {}


func _update_zone_info() -> void:
	var zone := _selected_zone()
	if zone.is_empty():
		_zone_info.text = "Sin zona seleccionada."
		return
	var biome := str(zone.get("biomeId", ""))
	var points: Array = zone.get("points", [])
	var biome_data: Dictionary = _source.get("biomeMaterials", {}).get(biome, {})
	var ground: Dictionary = biome_data.get("slots", {}).get("ground", {})
	_zone_info.text = "%s\nTipo: %s\nBioma: %s\nPolígono: %d puntos\nTextura: %s\nEscala: %s" % [
		str(zone.get("name", "")),
		"Acantilado" if bool(zone.get("isCliff", false)) else "Terreno",
		str(BIOME_LABELS.get(biome, biome)), points.size(),
		str(ground.get("name", "Sin textura base")), str(ground.get("scale", "—"))
	]


func _populate_spawns(nodes: Array, areas: Array) -> void:
	_spawn_ids.clear()
	_spawn_picker.clear()
	for entry in nodes:
		if not (entry is Dictionary) or str(entry.get("kind", "")) != "playerSpawn":
			continue
		var spawn_id := int(entry.get("id", -1))
		if spawn_id < 0:
			continue
		_spawn_ids.append(spawn_id)
		_spawn_picker.add_item("Jugador %s · Nodo %s" % [str(entry.get("playerSlot", "?")), str(spawn_id)])
	if _spawn_ids.is_empty():
		_current_spawn_id = -1
		_spawn_info.text = "No hay spawns de jugador. Zonas de spawn: %d" % areas.size()
		return
	var index := _spawn_ids.find(_current_spawn_id)
	if index < 0:
		index = 0
	_current_spawn_id = _spawn_ids[index]
	_spawn_picker.select(index)
	_update_spawn_info(areas)


func _on_spawn_selected(index: int) -> void:
	if index < 0 or index >= _spawn_ids.size():
		return
	_current_spawn_id = _spawn_ids[index]
	_update_spawn_info(_source.get("spawnAreas", []))
	_highlight_spawn()


func _selected_spawn() -> Dictionary:
	for entry in _source.get("nodes", []):
		if entry is Dictionary and int(entry.get("id", -1)) == _current_spawn_id and str(entry.get("kind", "")) == "playerSpawn":
			return entry
	return {}


func _update_spawn_info(areas: Array) -> void:
	var spawn := _selected_spawn()
	if spawn.is_empty():
		_spawn_info.text = "Sin spawn seleccionado."
		return
	_spawn_info.text = "Jugador %s\nX: %.2f\nZ: %.2f\nZonas de spawn: %d" % [
		str(spawn.get("playerSlot", "?")),
		float(spawn.get("x", 0)), float(spawn.get("z", 0)), areas.size()
	]


func _select_world() -> void:
	var world := _get_world()
	if world == null or _editor_interface == null:
		return
	var selection := _editor_interface.get_selection()
	selection.clear()
	selection.add_node(world)


func _on_preview_toggled(enabled: bool) -> void:
	var world := _get_world()
	if world != null:
		world.set("preview_in_editor", enabled)
		_status.text = "Vista previa activada" if enabled else "Vista previa oculta"


func _rebuild_preview() -> void:
	var world := _get_world()
	if world == null:
		_status.text = "Abre scenes/main.tscn primero."
		return
	world.call_deferred("_rebuild_world")
	_status.text = "Reconstruyendo vista previa..."


func _clear_marker() -> void:
	if is_instance_valid(_marker):
		if _marker.get_parent() != null:
			_marker.get_parent().remove_child(_marker)
		_marker.queue_free()
	_marker = null


func _terrain_y(x: float, z: float) -> float:
	var world := _get_world()
	if world != null and world.has_method("_height_at"):
		return float(world.call("_height_at", x, z))
	return 0.0


func _highlight_zone() -> void:
	_clear_marker()
	var world := _get_world()
	var zone := _selected_zone()
	if world == null or zone.is_empty():
		return
	var points: Array = zone.get("points", [])
	if points.size() < 3:
		return
	var material := StandardMaterial3D.new()
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.albedo_color = Color(0.0, 1.0, 0.86, 1.0)
	material.no_depth_test = true
	var lines := ImmediateMesh.new()
	lines.surface_begin(Mesh.PRIMITIVE_LINES, material)
	for i in range(points.size()):
		var a: Dictionary = points[i]
		var b: Dictionary = points[(i + 1) % points.size()]
		var ax := float(a.get("x", 0))
		var az := float(a.get("z", 0))
		var bx := float(b.get("x", 0))
		var bz := float(b.get("z", 0))
		lines.surface_add_vertex(Vector3(ax, _terrain_y(ax, az) + 2.0, az))
		lines.surface_add_vertex(Vector3(bx, _terrain_y(bx, bz) + 2.0, bz))
	lines.surface_end()
	var marker := MeshInstance3D.new()
	marker.name = "__WildTrapZoneOutline"
	marker.mesh = lines
	marker.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	marker.set_meta("wildtrap_editor_marker", true)
	world.add_child(marker)
	_marker = marker
	_status.text = "Zona resaltada: " + str(zone.get("name", ""))


func _highlight_spawn() -> void:
	_clear_marker()
	var world := _get_world()
	var spawn := _selected_spawn()
	if world == null or spawn.is_empty():
		return
	var x := float(spawn.get("x", 0))
	var z := float(spawn.get("z", 0))
	var material := StandardMaterial3D.new()
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.albedo_color = Color(1.0, 0.79, 0.14, 1.0)
	material.no_depth_test = true
	var sphere := SphereMesh.new()
	sphere.radius = 2.5
	sphere.height = 5.0
	var marker := MeshInstance3D.new()
	marker.name = "__WildTrapSpawnMarker"
	marker.mesh = sphere
	marker.material_override = material
	marker.position = Vector3(x, _terrain_y(x, z) + 5.0, z)
	marker.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	marker.set_meta("wildtrap_editor_marker", true)
	world.add_child(marker)
	_marker = marker
	_status.text = "Spawn señalado: Jugador " + str(spawn.get("playerSlot", "?"))


func debug_summary() -> Dictionary:
	return {
		"zones": _zone_ids.size(),
		"spawns": _spawn_ids.size(),
		"world_found": _get_world() != null,
		"terrain_info": _terrain_info.text if _terrain_info != null else "",
		"zone_info": _zone_info.text if _zone_info != null else "",
		"spawn_info": _spawn_info.text if _spawn_info != null else "",
	}
