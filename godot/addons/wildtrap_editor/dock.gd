@tool
extends VBoxContainer
## WildTrap native editor: editable biome distributions, local JSON persistence,
## undo/redo and non-persistent 3D inspection markers.
const STORE = preload("res://addons/wildtrap_editor/world_store.gd")
const RULES = preload("res://addons/wildtrap_editor/biome_rules.gd")
const BIOMES := ["forest","desert","plains","swamp","mountain"]
const LABELS := {
	"forest":"Bosque","desert":"Desierto","plains":"Pradera",
	"swamp":"Pantano","mountain":"Montaña"
}
const PAGE_SIZE := 12
const MARKER_COLOR := Color(0.40,0.70,0.56,1.0)

var _editor_interface: EditorInterface
var _scene_root: Node
var _store: RefCounted = STORE.new()
var _source: Dictionary = {}
var _marker: Node3D
var _current_zone_id := ""
var _current_spawn_id := -1
var _selected_biome := ""
var _show_cliff_areas := false
var _zone_selection_active := false
var _options: Array = []
var _page := 0

var _status: Label
var _biome_info: Label
var _zone_info: Label
var _spawn_info: Label
var _zone_list: VBoxContainer
var _zone_buttons: Array = []
var _biome_buttons: Dictionary = {}
var _spawn_buttons: Array = []
var _distribution_list: VBoxContainer
var _distribution_label: Label
var _save_button: Button
var _undo_button: Button
var _redo_button: Button
var _prev_button: Button
var _next_button: Button
var _cliff_toggle: Button
var _tab_scrolls: Dictionary = {}


func _init() -> void:
	custom_minimum_size = Vector2(280,220)
	size_flags_vertical = Control.SIZE_EXPAND_FILL


func set_editor_interface(value: EditorInterface) -> void:
	_editor_interface=value


func _ready() -> void:
	_build_panel()
	if not _store.open():
		_status.text=_store.last_error
	refresh_scene()


func on_scene_changed(root: Node) -> void:
	_clear_marker()
	_scene_root=root
	refresh_scene()


func _get_world() -> Node3D:
	if not is_instance_valid(_scene_root):
		return null
	return _scene_root.get_node_or_null("World") as Node3D


func _label(parent: Node, content: String) -> Label:
	var label := Label.new()
	label.text=content
	label.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART
	label.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	parent.add_child(label)
	return label


func _button(parent: Node, title: String, callback: Callable) -> Button:
	var button := Button.new()
	button.text=title
	button.pressed.connect(callback)
	button.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	parent.add_child(button)
	return button


func _tab(tabs: TabContainer, name_text: String) -> VBoxContainer:
	var scroll := ScrollContainer.new()
	scroll.name=name_text
	scroll.horizontal_scroll_mode=ScrollContainer.SCROLL_MODE_DISABLED
	scroll.vertical_scroll_mode=ScrollContainer.SCROLL_MODE_SHOW_ALWAYS
	scroll.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	scroll.size_flags_vertical=Control.SIZE_EXPAND_FILL
	tabs.add_child(scroll)
	_tab_scrolls[name_text]=scroll
	var body := VBoxContainer.new()
	body.name=name_text+"Content"
	body.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	scroll.add_child(body)
	return body

func _build_panel() -> void:
	var header := _label(self,"WILDTRAP EDITOR")
	header.add_theme_font_size_override("font_size",17)
	_status=_label(self,"Datos nativos de Godot · Guardado en Git")
	var saves := HBoxContainer.new()
	add_child(saves)
	_save_button=_button(saves,"Guardar",_save_world)
	_undo_button=_button(saves,"Deshacer",_undo_edit)
	_redo_button=_button(saves,"Rehacer",_redo_edit)
	_button(self,"Recargar archivo de Git",_reload_world)
	var tabs := TabContainer.new()
	tabs.name="WildTrapTabs"
	tabs.size_flags_vertical=Control.SIZE_EXPAND_FILL
	add_child(tabs)

	var biome_tab := _tab(tabs,"Biomas")
	var grid := GridContainer.new()
	grid.columns=2
	grid.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	biome_tab.add_child(grid)
	for biome in BIOMES:
		var item := _button(grid,str(LABELS[biome]),_select_biome.bind(biome))
		item.toggle_mode=true
		item.name="Biome_"+biome
		_biome_buttons[biome]=item
	_button(biome_tab,"Quitar selección",_clear_biome)
	_biome_info=_label(biome_tab,"")

	var zones_tab := _tab(tabs,"Zonas")
	_label(zones_tab,"Regiones y acantilados existentes")
	_cliff_toggle=_button(zones_tab,"Mostrar acantilados",_toggle_cliffs)
	_cliff_toggle.name="ShowCliffs"
	_cliff_toggle.toggle_mode=true
	_zone_list=VBoxContainer.new()
	_zone_list.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	zones_tab.add_child(_zone_list)
	_zone_info=_label(zones_tab,"")
	_zone_info.visible=false
	_label(zones_tab,"Distribuciones posibles")
	_distribution_list=VBoxContainer.new()
	_distribution_list.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	zones_tab.add_child(_distribution_list)
	var pager := HBoxContainer.new()
	zones_tab.add_child(pager)
	_prev_button=_button(pager,"Anterior",_previous_page)
	_distribution_label=_label(pager,"")
	_next_button=_button(pager,"Siguiente",_next_page)

	var spawns_tab := _tab(tabs,"Spawns")
	var spawn_list := VBoxContainer.new()
	spawn_list.name="SpawnList"
	spawns_tab.add_child(spawn_list)
	_spawn_info=_label(spawns_tab,"")
	_button(spawns_tab,"Ocultar marcador",_clear_marker)


func refresh_scene() -> void:
	if _status==null:
		return
	_source=_store.data
	if _source.is_empty():
		_status.text=_store.last_error if not _store.last_error.is_empty() else "No se pudo cargar world.json"
		return
	_update_biome_buttons()
	_rebuild_zone_buttons()
	_rebuild_spawn_buttons()
	_update_zone_info()
	_update_spawn_info()
	_recalculate_distributions()
	_update_save_buttons()
	if _get_world()!=null:
		_apply_preview()


func _apply_preview() -> void:
	var world := _get_world()
	if world==null:
		return
	if world.has_method("apply_editor_biome_preview") and _store.dirty:
		world.call("apply_editor_biome_preview",_source,_selected_biome)
	elif world.has_method("set_editor_biome_selection"):
		world.call("set_editor_biome_selection",_selected_biome)
	if world.has_method("set_editor_zone_selection"):
		world.call("set_editor_zone_selection",_selected_zone() if _zone_selection_active else {})
	if world.has_method("set_editor_cliffs_visible"):
		world.call("set_editor_cliffs_visible",_show_cliff_areas)


func _update_save_buttons() -> void:
	if _save_button==null:
		return
	_save_button.disabled=not _store.dirty
	_undo_button.disabled=not _store.can_undo()
	_redo_button.disabled=not _store.can_redo()


func _select_biome(biome: String) -> void:
	_selected_biome=biome
	_zone_selection_active=false
	_clear_marker()
	_update_biome_buttons()
	var world := _get_world()
	if world!=null:
		if world.has_method("set_editor_zone_selection"):
			world.call("set_editor_zone_selection",{})
		if world.has_method("set_editor_biome_selection"):
			world.call("set_editor_biome_selection",biome)
	_status.text="Bioma: "+str(LABELS.get(biome,biome))


func _clear_biome() -> void:
	_selected_biome=""
	_zone_selection_active=false
	_update_biome_buttons()
	var world := _get_world()
	if world!=null:
		if world.has_method("set_editor_biome_selection"):
			world.call("set_editor_biome_selection","")
		if world.has_method("set_editor_zone_selection"):
			world.call("set_editor_zone_selection",{})


func _toggle_cliffs() -> void:
	_show_cliff_areas=not _show_cliff_areas
	_cliff_toggle.set_pressed_no_signal(_show_cliff_areas)
	_cliff_toggle.text="Ocultar acantilados" if _show_cliff_areas else "Mostrar acantilados"
	var world := _get_world()
	if world!=null and world.has_method("set_editor_cliffs_visible"):
		world.call("set_editor_cliffs_visible",_show_cliff_areas)

func _update_biome_buttons() -> void:
	var counts: Dictionary = {}
	for biome in BIOMES:
		counts[biome]=0
	for zone in RULES.regions(_source):
		var biome := str(zone.get("biomeId",""))
		if counts.has(biome):
			counts[biome]+=1
	for biome in BIOMES:
		var button: Button = _biome_buttons[biome]
		button.set_pressed_no_signal(_selected_biome==biome)
		button.text=str(LABELS[biome])+" · "+str(counts[biome])
	_biome_info.text=""


func _rebuild_zone_buttons() -> void:
	for button in _zone_buttons:
		if is_instance_valid(button):
			button.queue_free()
	_zone_buttons.clear()
	for candidate in _source.get("zones",[]):
		if not (candidate is Dictionary):
			continue
		var zone: Dictionary = candidate
		var id_text := str(zone.get("id",""))
		if id_text.is_empty():
			continue
		var biome := str(zone.get("biomeId",""))
		var mark := "⛰ " if bool(zone.get("isCliff",false)) else "◉ "
		var title := mark+str(zone.get("name",id_text))
		var button := _button(_zone_list,title,_choose_zone.bind(id_text))
		button.tooltip_text=str(LABELS.get(biome,biome))
		button.toggle_mode=true
		button.set_pressed_no_signal(_current_zone_id==id_text)
		_zone_buttons.append(button)
	if _current_zone_id.is_empty() and not _source.get("zones",[]).is_empty():
		_current_zone_id=str(_source["zones"][0].get("id",""))
	_repaint_zone_selection()


func _repaint_zone_selection() -> void:
	var zones: Array = _source.get("zones",[])
	for i in range(mini(zones.size(),_zone_buttons.size())):
		var button: Button = _zone_buttons[i]
		button.set_pressed_no_signal(str(zones[i].get("id",""))==_current_zone_id)


func _choose_zone(identifier: String) -> void:
	_current_zone_id=identifier
	_zone_selection_active=true
	_selected_biome=""
	_update_biome_buttons()
	_repaint_zone_selection()
	_update_zone_info()
	var world := _get_world()
	if world!=null:
		if world.has_method("set_editor_biome_selection"):
			world.call("set_editor_biome_selection","")
		if world.has_method("set_editor_zone_selection"):
			world.call("set_editor_zone_selection",_selected_zone())
	_highlight_zone()

func _selected_zone() -> Dictionary:
	for zone in _source.get("zones",[]):
		if zone is Dictionary and str(zone.get("id",""))==_current_zone_id:
			return zone
	return {}


func _update_zone_info() -> void:
	if _zone_info==null:
		return
	var zone := _selected_zone()
	_zone_info.text=str(zone.get("name","")) if not zone.is_empty() else ""

func _recalculate_distributions() -> void:
	var result: Dictionary = RULES.enumerate(_source)
	if not result.get("ok",false):
		_options=[]
		_distribution_label.text=str(result.get("error","Sin distribuciones"))
	else:
		_options=result.get("options",[])
		_distribution_label.text=""
	_page=clampi(_page,0,maxi(0,int(ceil(float(_options.size())/PAGE_SIZE))-1))
	_render_distributions()


func _render_distributions() -> void:
	for child in _distribution_list.get_children():
		_distribution_list.remove_child(child)
		child.queue_free()
	var current := RULES.current_index(_source,_options)
	var start := _page*PAGE_SIZE
	for i in range(start,mini(_options.size(),start+PAGE_SIZE)):
		var option: Array = _options[i]
		var button := _button(_distribution_list,"Posibilidad "+str(i+1),_choose_distribution.bind(i))
		button.toggle_mode=true
		button.set_pressed_no_signal(i==current)
		var main_zones: Array = RULES.regions(_source)
		var description: Array[String] = []
		for k in range(option.size()):
			description.append(str(main_zones[k].get("name",""))+": "+str(LABELS.get(option[k],option[k])))
		button.tooltip_text=" | ".join(description)
	_prev_button.disabled=_page<=0
	_next_button.disabled=(_page+1)*PAGE_SIZE>=_options.size()
	_distribution_label.text="%d/%d" % [_page+1,maxi(1,int(ceil(float(_options.size())/PAGE_SIZE)))] if not _options.is_empty() else "0/0"


func _previous_page() -> void:
	_page=maxi(0,_page-1)
	_recalculate_distributions()


func _next_page() -> void:
	_page=mini(maxi(0,int(ceil(float(_options.size())/PAGE_SIZE))-1),_page+1)
	_recalculate_distributions()


func _choose_distribution(index: int) -> void:
	if index<0 or index>=_options.size():
		return
	if not _store.apply_distribution(_options[index]):
		_status.text=_store.last_error
		return
	_source=_store.data
	_clear_marker()
	_update_biome_buttons()
	_rebuild_zone_buttons()
	_update_zone_info()
	_recalculate_distributions()
	_update_save_buttons()
	_apply_preview()
	_status.text="Distribución sin guardar."


func _undo_edit() -> void:
	if _store.undo():
		_after_history_change("Deshacer aplicado")


func _redo_edit() -> void:
	if _store.redo():
		_after_history_change("Rehacer aplicado")


func _after_history_change(status_text: String) -> void:
	_source=_store.data
	_clear_marker()
	_update_biome_buttons()
	_rebuild_zone_buttons()
	_update_zone_info()
	_recalculate_distributions()
	_update_save_buttons()
	_apply_preview()
	_status.text=status_text


func _save_world() -> void:
	if _store.save():
		_update_save_buttons()
		if _editor_interface!=null:
			_editor_interface.get_resource_filesystem().scan()
		_status.text="Guardado correctamente."
	else:
		_status.text="No guardado: "+_store.last_error


func _reload_world() -> void:
	if _store.dirty:
		_status.text="Guarda o deshaz antes de recargar."
		return
	if _store.open():
		refresh_scene()
		_status.text="Datos de Godot recargados."
	else:
		_status.text=_store.last_error


func _rebuild_spawn_buttons() -> void:
	var body := find_child("SpawnList",true,false) as VBoxContainer
	if body==null:
		return
	for child in body.get_children():
		body.remove_child(child)
		child.queue_free()
	_spawn_buttons.clear()
	for entry in _source.get("nodes",[]):
		if not (entry is Dictionary) or str(entry.get("kind",""))!="playerSpawn":
			continue
		var id_num := int(entry.get("id",-1))
		var button := _button(body,"Jugador "+str(entry.get("playerSlot","?"))+" · "+str(id_num),_select_spawn.bind(id_num))
		_spawn_buttons.append(button)
	if _current_spawn_id==-1 and not _spawn_buttons.is_empty():
		for entry in _source.get("nodes",[]):
			if entry is Dictionary and str(entry.get("kind",""))=="playerSpawn":
				_current_spawn_id=int(entry.get("id",-1))
				break
	_update_spawn_info()


func _select_spawn(id_num: int) -> void:
	_current_spawn_id=id_num
	_update_spawn_info()
	_highlight_spawn()


func _selected_spawn() -> Dictionary:
	for entry in _source.get("nodes",[]):
		if entry is Dictionary and str(entry.get("kind",""))=="playerSpawn" and int(entry.get("id",-1))==_current_spawn_id:
			return entry
	return {}


func _update_spawn_info() -> void:
	if _spawn_info==null:
		return
	var spawn := _selected_spawn()
	if spawn.is_empty():
		_spawn_info.text="No hay un spawn seleccionado."
	else:
		_spawn_info.text="Jugador %s\nX: %.2f | Z: %.2f\nÁreas: %d" % [
			str(spawn.get("playerSlot","?")),float(spawn.get("x",0)),
			float(spawn.get("z",0)),(_source.get("spawnAreas",[]) as Array).size()
		]


func _clear_marker() -> void:
	if is_instance_valid(_marker):
		if _marker.get_parent()!=null:
			_marker.get_parent().remove_child(_marker)
		_marker.queue_free()
	_marker=null


func _terrain_y(x: float,z: float) -> float:
	var world := _get_world()
	if world!=null and world.has_method("_height_at"):
		return float(world.call("_height_at",x,z))
	return 0.0


func _highlight_zone() -> void:
	_clear_marker()
	var world := _get_world()
	var zone := _selected_zone()
	if world==null or zone.is_empty():
		return
	var points: Array = zone.get("points",[])
	if points.size()<3:
		return
	var material := StandardMaterial3D.new()
	material.shading_mode=BaseMaterial3D.SHADING_MODE_UNSHADED
	material.albedo_color=MARKER_COLOR
	material.no_depth_test=true
	var lines := ImmediateMesh.new()
	lines.surface_begin(Mesh.PRIMITIVE_LINES,material)
	for i in range(points.size()):
		var a: Dictionary = points[i]
		var b: Dictionary = points[(i+1)%points.size()]
		var ax := float(a.get("x",0))
		var az := float(a.get("z",0))
		var bx := float(b.get("x",0))
		var bz := float(b.get("z",0))
		lines.surface_add_vertex(Vector3(ax,_terrain_y(ax,az)+2.0,az))
		lines.surface_add_vertex(Vector3(bx,_terrain_y(bx,bz)+2.0,bz))
	lines.surface_end()
	var marker := MeshInstance3D.new()
	marker.name="__WildTrapZoneOutline"
	marker.mesh=lines
	marker.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	marker.set_meta("wildtrap_editor_marker",true)
	world.add_child(marker)
	_marker=marker


func _highlight_spawn() -> void:
	_clear_marker()
	var world := _get_world()
	var spawn := _selected_spawn()
	if world==null or spawn.is_empty():
		return
	var x := float(spawn.get("x",0))
	var z := float(spawn.get("z",0))
	var material := StandardMaterial3D.new()
	material.shading_mode=BaseMaterial3D.SHADING_MODE_UNSHADED
	material.albedo_color=Color(1,0.79,0.14,1)
	material.no_depth_test=true
	var sphere := SphereMesh.new()
	sphere.radius=2.5
	sphere.height=5.0
	var marker := MeshInstance3D.new()
	marker.name="__WildTrapSpawnMarker"
	marker.mesh=sphere
	marker.material_override=material
	marker.position=Vector3(x,_terrain_y(x,z)+5.0,z)
	marker.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	marker.set_meta("wildtrap_editor_marker",true)
	world.add_child(marker)
	_marker=marker


func debug_summary() -> Dictionary:
	return {
		"zones":(_source.get("zones",[]) as Array).size(),
		"spawns":_spawn_buttons.size(),
		"world_found":_get_world()!=null,
		"terrain_info":"%d alturas" % (_source.get("heights",[]) as Array).size(),
		"zone_info":_zone_info.text if _zone_info!=null else "",
		"spawn_info":_spawn_info.text if _spawn_info!=null else "",
		"distribution_count":_options.size(),
		"dirty":_store.dirty,
	}
