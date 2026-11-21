@tool
extends VBoxContainer
## WildTrap native editor: editable biome distributions, local JSON persistence,
## undo/redo and non-persistent 3D inspection markers.
const STORE = preload("res://addons/wildtrap_editor/world_store.gd")
const RULES = preload("res://addons/wildtrap_editor/biome_rules.gd")
const SPAWNS = preload("res://addons/wildtrap_editor/spawn_rules.gd")
const SPAWN_VIEW = preload("res://addons/wildtrap_editor/spawn_viewport.gd")
const PLAY_SPAWN = preload("res://scripts/play_spawn_preview.gd")
const OBJECT_EDITOR = preload("res://addons/wildtrap_editor/object_editor.gd")
const TEXTURE_EDITOR = preload("res://addons/wildtrap_editor/texture_editor.gd")
const SPAWN_NAMES := {
	"player":"Jugador","npc":"NPC","trees":"Árboles","grass":"Hierbas",
	"plants":"Plantas","rocks":"Rocas","objects":"Objetos",
	"specialCreature":"Criatura especial","river":"Río","swamp":"Pantano",
	"lake":"Lago","oasis":"Oasis","dune":"Duna","mountain":"Montaña",
	"cliff":"Acantilado","unassigned":"Sin asignar"
}
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
var _material_visibility := {"details":true,"handpaint":true,"cliffs":true}
var _handpaint_preview_opacity := 0.50
var _tabs: TabContainer
var _object_editor: Control
var _texture_editor: Control
var _spawn_mode := ""
var _spawn_drag_id := -1
var _spawn_drag_position := Vector3.ZERO
var _spawn_dragging := false
var _pending_spawn_area: Array = []
var _selected_spawn_kind := "point"
var _selected_spawn_area_id := ""
var _spawn_point_category: OptionButton
var _spawn_slot: OptionButton
var _spawn_list: VBoxContainer
var _spawn_area_list: VBoxContainer
var _spawn_point_form: VBoxContainer
var _spawn_area_form: VBoxContainer
var _spawn_point_x: SpinBox
var _spawn_point_z: SpinBox
var _spawn_vertex_x: SpinBox
var _spawn_vertex_z: SpinBox
var _spawn_vertex_picker: OptionButton
var _spawn_area_name: LineEdit
var _spawn_area_type: OptionButton
var _spawn_area_biome: OptionButton
var _spawn_density: HSlider
var _spawn_density_label: Label
var _spawn_area_hidden: CheckButton
var _spawn_hint: Label
var _spawn_selected_vertex := 0
var _updating_spawn_controls := false
var _preview_signature := ""


func _init() -> void:
	custom_minimum_size = Vector2(380,220)
	size_flags_vertical = Control.SIZE_EXPAND_FILL


func set_editor_interface(value: EditorInterface) -> void:
	_editor_interface=value


func _ready() -> void:
	_build_panel()
	if not _store.open():
		_status.text=_store.last_error
	refresh_scene()


func on_scene_changed(root: Node) -> void:
	clear_spawn_preview()
	_spawn_mode=""
	_pending_spawn_area.clear()
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
	_status=_label(self,"")
	var saves := HBoxContainer.new()
	add_child(saves)
	_save_button=_button(saves,"Guardar",_save_world)
	_undo_button=_button(saves,"Deshacer",_undo_edit)
	_redo_button=_button(saves,"Rehacer",_redo_edit)
	_button(self,"Recargar archivo de Git",_reload_world)
	var tabs := TabContainer.new()
	_tabs=tabs
	tabs.name="WildTrapTabs"
	tabs.tab_changed.connect(_tab_changed)
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
	_zone_list.name="ZoneList"
	_zone_list.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	zones_tab.add_child(_zone_list)
	_zone_info=_label(zones_tab,"")
	_zone_info.visible=false
	_label(zones_tab,"Distribuciones posibles")
	_distribution_list=VBoxContainer.new()
	_distribution_list.name="DistributionList"
	_distribution_list.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	zones_tab.add_child(_distribution_list)
	var pager := HBoxContainer.new()
	pager.name="DistributionPager"
	zones_tab.add_child(pager)
	_prev_button=_button(pager,"Anterior",_previous_page)
	_distribution_label=_label(pager,"")
	_next_button=_button(pager,"Siguiente",_next_page)

	
	var spawns_tab := _tab(tabs,"Spawns")
	# Direct tools: place green markers continuously, draw areas, or cancel.
	# Clicking an existing green marker opens its editable properties.
	var draw_tools := HBoxContainer.new()
	spawns_tab.add_child(draw_tools)
	_button(draw_tools,"Punto",_set_spawn_mode.bind("point"))
	_button(draw_tools,"Área",_set_spawn_mode.bind("area"))
	_button(draw_tools,"Cancelar",_cancel_spawn_tool)
	_button(draw_tools,"Eliminar punto",_delete_selected_point)
	_spawn_hint=_label(spawns_tab,"Crea un área marcando sus vértices y tocando de nuevo el primero para cerrarla.")

	_label(spawns_tab,"Puntos")
	_spawn_list=VBoxContainer.new()
	_spawn_list.name="SpawnList"
	spawns_tab.add_child(_spawn_list)
	_label(spawns_tab,"Áreas")
	_spawn_area_list=VBoxContainer.new()
	_spawn_area_list.name="SpawnAreaList"
	spawns_tab.add_child(_spawn_area_list)
	_spawn_info=_label(spawns_tab,"")

	_spawn_point_form=VBoxContainer.new()
	_spawn_point_form.name="SpawnPointProperties"
	spawns_tab.add_child(_spawn_point_form)
	var point_params := HBoxContainer.new()
	_spawn_point_form.add_child(point_params)
	_spawn_point_category=OptionButton.new()
	_spawn_point_category.name="SpawnCategory"
	_spawn_point_category.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	for cat in SPAWNS.POINT_CATEGORIES:
		_spawn_point_category.add_item(str(SPAWN_NAMES.get(cat,cat)))
	_spawn_point_category.item_selected.connect(_on_spawn_category_selected)
	point_params.add_child(_spawn_point_category)
	_spawn_slot=OptionButton.new()
	_spawn_slot.name="PlayerSlot"
	for slot in range(1,SPAWNS.MAX_PLAYERS+1):
		_spawn_slot.add_item("J"+str(slot))
	_spawn_slot.item_selected.connect(_on_spawn_slot_selected)
	point_params.add_child(_spawn_slot)


	_spawn_area_form=VBoxContainer.new()
	_spawn_area_form.name="SpawnAreaProperties"
	spawns_tab.add_child(_spawn_area_form)
	_spawn_area_name=LineEdit.new()
	_spawn_area_name.placeholder_text="Nombre del área"
	_spawn_area_form.add_child(_spawn_area_name)
	_spawn_area_name.text_submitted.connect(_on_area_name_submitted)
	_spawn_area_name.focus_exited.connect(_on_area_name_focus_exited)
	_spawn_area_type=OptionButton.new()
	for category in SPAWNS.AREA_CATEGORIES:
		_spawn_area_type.add_item(str(SPAWN_NAMES.get(category,category)))
	_spawn_area_form.add_child(_spawn_area_type)
	_spawn_area_type.item_selected.connect(_on_area_type_selected)
	_spawn_area_biome=OptionButton.new()
	for biome in SPAWNS.BIOME_IDS:
		_spawn_area_biome.add_item("Todos" if biome=="any" else str(LABELS.get(biome,biome)))
	_spawn_area_form.add_child(_spawn_area_biome)
	_spawn_area_biome.item_selected.connect(_on_area_biome_selected)
	var density_row := HBoxContainer.new()
	_spawn_area_form.add_child(density_row)
	_spawn_density=HSlider.new()
	_spawn_density.name="SpawnDensity"
	_spawn_density.min_value=0
	_spawn_density.max_value=100
	_spawn_density.step=1
	_spawn_density.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	density_row.add_child(_spawn_density)
	_spawn_density_label=_label(density_row,"40%")
	_spawn_density.value_changed.connect(_on_density_preview)
	_spawn_density.drag_ended.connect(_on_density_committed)
	_spawn_area_hidden=CheckButton.new()
	_spawn_area_hidden.text="Ocultar"
	_spawn_area_hidden.toggled.connect(_on_area_hidden_toggled)
	_spawn_area_form.add_child(_spawn_area_hidden)
	_spawn_vertex_picker=OptionButton.new()
	_spawn_area_form.add_child(_spawn_vertex_picker)
	_spawn_vertex_picker.item_selected.connect(_on_vertex_selected)
	var vertex_row := HBoxContainer.new()
	_spawn_area_form.add_child(vertex_row)
	_spawn_vertex_x=_coordinate(vertex_row)
	_spawn_vertex_z=_coordinate(vertex_row)
	_button(_spawn_area_form,"Aplicar vértice X/Z",_apply_vertex_coordinates)
	_button(_spawn_area_form,"Mover vértice en 3D",_set_spawn_mode.bind("move_vertex"))
	_button(_spawn_area_form,"Eliminar área",_delete_selected_spawn)
	_spawn_point_form.visible=false
	_spawn_area_form.visible=false

	var objects_tab := _tab(tabs,"Objetos")
	_object_editor=OBJECT_EDITOR.new()
	_object_editor.name="ObjectTools"
	objects_tab.add_child(_object_editor)
	_object_editor.call("configure",_store,self)

	var textures_tab := _tab(tabs,"Texturas")
	_texture_editor=TEXTURE_EDITOR.new()
	_texture_editor.name="TextureTools"
	textures_tab.add_child(_texture_editor)
	_texture_editor.call("configure",_store,self)



func _coordinate(parent: Node) -> SpinBox:
	var spin := SpinBox.new()
	spin.min_value=-315.0
	spin.max_value=315.0
	spin.step=0.25
	spin.allow_greater=false
	spin.allow_lesser=false
	spin.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	parent.add_child(spin)
	return spin


func _tab_changed(index: int) -> void:
	if index!=2:
		_spawn_dragging=false
		_spawn_drag_id=-1
		_spawn_mode=""
		_pending_spawn_area.clear()
		clear_spawn_preview()
	else:
		if _spawn_mode.is_empty():
			_spawn_mode="select"
		_redraw_spawn_overlay()
	if index!=3 and _object_editor!=null:
		_object_editor.call("deactivate")




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
	if _object_editor!=null:
		_object_editor.call("refresh")
	if _texture_editor!=null:
		_texture_editor.call("refresh")
	if _get_world()!=null:
		_apply_preview()
	_redraw_spawn_overlay()


func set_texture_layer_visible(key: String,enabled: bool) -> void:
	if not _material_visibility.has(key):
		return
	_material_visibility[key]=enabled
	_update_material_preview()


func external_editor_changed(category: String) -> void:
	_source=_store.data
	_update_save_buttons()
	var world:=_get_world()
	if category=="objects":
		if world!=null and world.has_method("apply_editor_objects_preview"):
			world.call("apply_editor_objects_preview",_source)
		if _object_editor!=null:
			_object_editor.call("refresh")
	elif category=="materials":
		if world!=null and world.has_method("apply_editor_material_preview"):
			world.call("apply_editor_material_preview",_source)
		_update_material_preview()
		if _texture_editor!=null:
			_texture_editor.call("refresh")
	_status.text="Cambios sin guardar."


func handle_object_viewport_input(camera: Camera3D,event: InputEvent) -> bool:
	if _tabs==null or _tabs.current_tab!=3 or _object_editor==null:
		return false
	return bool(_object_editor.call("handle_3d_input",camera,event))


func _set_material_visible(enabled: bool, key: String) -> void:
	_material_visibility[key]=enabled
	_update_material_preview()


func _set_handpaint_preview_opacity(value: float) -> void:
	_handpaint_preview_opacity=clampf(value/100.0,0.0,1.0)
	_update_material_preview()


func _update_material_preview() -> void:
	var world:=_get_world()
	if world==null:
		return
	if world.has_method("set_editor_details_visible"):
		world.call("set_editor_details_visible",bool(_material_visibility["details"]))
	if world.has_method("set_editor_handpaint_visible"):
		world.call("set_editor_handpaint_visible",bool(_material_visibility["handpaint"]))
	if world.has_method("set_editor_cliff_colors_visible"):
		world.call("set_editor_cliff_colors_visible",bool(_material_visibility["cliffs"]))


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
	_update_material_preview()


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
		button.text=str(LABELS[biome])
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
	_rebuild_spawn_buttons()
	_apply_preview()
	var world:=_get_world()
	if world!=null:
		if world.has_method("apply_editor_objects_preview"):
			world.call("apply_editor_objects_preview",_source)
		if world.has_method("apply_editor_material_preview"):
			world.call("apply_editor_material_preview",_source)
		_update_material_preview()
	if _object_editor!=null:
		_object_editor.call("refresh")
	if _texture_editor!=null:
		_texture_editor.call("refresh")
	_redraw_spawn_overlay()
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
		_pending_spawn_area.clear()
		_spawn_mode=""
		var world:=_get_world()
		if world!=null:
			world.call_deferred("_rebuild_world")
		refresh_scene()
		_status.text="Datos de Godot recargados."
	else:
		_status.text=_store.last_error


func _rebuild_spawn_buttons() -> void:
	for row in _spawn_list.get_children():
		_spawn_list.remove_child(row)
		row.queue_free()
	_spawn_buttons.clear()
	for entry in _source.get("nodes",[]):
		if not (entry is Dictionary) or not SPAWNS.is_spawn_node(entry):
			continue
		var id_num := int(entry.get("id",-1))
		var category: String = SPAWNS.point_category(entry)
		var label_text := "J"+str(int(entry.get("playerSlot",0))) if category=="player" else str(SPAWN_NAMES.get(category,category))+" "+str(id_num)
		var button := _button(_spawn_list,label_text,_select_spawn.bind(id_num))
		button.toggle_mode=true
		button.set_pressed_no_signal(_selected_spawn_kind=="point" and _current_spawn_id==id_num)
		_spawn_buttons.append(button)
	if _current_spawn_id==-1 and not _spawn_buttons.is_empty():
		for entry in _source.get("nodes",[]):
			if entry is Dictionary and SPAWNS.is_spawn_node(entry):
				_current_spawn_id=int(entry.get("id",-1))
				break
	for row in _spawn_area_list.get_children():
		_spawn_area_list.remove_child(row)
		row.queue_free()
	for area in _source.get("spawnAreas",[]):
		if not (area is Dictionary):
			continue
		var id_text := str(area.get("id",""))
		var title_text := str(area.get("name","Área"))
		var button := _button(_spawn_area_list,title_text,_select_spawn_area.bind(id_text))
		button.toggle_mode=true
		button.set_pressed_no_signal(_selected_spawn_kind=="area" and _selected_spawn_area_id==id_text)
	_update_spawn_info()


func _select_spawn(id_num: int) -> void:
	_current_spawn_id=id_num
	_selected_spawn_kind="point"
	_selected_spawn_area_id=""
	_pending_spawn_area.clear()
	_spawn_mode="select"
	SPAWN_VIEW.clear_cursor(_get_world())
	_rebuild_spawn_buttons()
	_update_spawn_info()
	_redraw_spawn_overlay()
	_highlight_spawn()


func _select_spawn_area(id_text: String) -> void:
	_selected_spawn_area_id=id_text
	_selected_spawn_kind="area"
	_pending_spawn_area.clear()
	_spawn_mode="select"
	SPAWN_VIEW.clear_cursor(_get_world())
	_spawn_selected_vertex=0
	_rebuild_spawn_buttons()
	_update_spawn_info()
	_redraw_spawn_overlay()


func _selected_spawn() -> Dictionary:
	for entry in _source.get("nodes",[]):
		if entry is Dictionary and SPAWNS.is_spawn_node(entry) and int(entry.get("id",-1))==_current_spawn_id:
			return entry
	return {}


func _selected_spawn_area() -> Dictionary:
	for entry in _source.get("spawnAreas",[]):
		if entry is Dictionary and str(entry.get("id",""))==_selected_spawn_area_id:
			return entry
	return {}


func _update_spawn_info() -> void:
	if _spawn_info==null:
		return
	var point := _selected_spawn()
	var area := _selected_spawn_area()
	_spawn_point_form.visible=_selected_spawn_kind=="point" and not point.is_empty()
	_spawn_area_form.visible=_selected_spawn_kind=="area" and not area.is_empty()
	_updating_spawn_controls=true
	if _spawn_point_form.visible:
		var cat: String=SPAWNS.point_category(point)
		var index: int=SPAWNS.POINT_CATEGORIES.find(cat)
		_spawn_point_category.select(maxi(index,0))
		_spawn_slot.visible=cat=="player"
		# All J slots remain selectable: choosing an occupied slot moves
		# that player's spawn role here, leaving the old marker unassigned.
		var occupied: Dictionary={}
		for entry in _source.get("nodes",[]):
			if entry is Dictionary and str(entry.get("kind",""))=="playerSpawn" and int(entry.get("id",-1))!=_current_spawn_id:
				occupied[int(entry.get("playerSlot",0))]=true
		for i in range(SPAWNS.MAX_PLAYERS):
			_spawn_slot.set_item_disabled(i,false)
			_spawn_slot.set_item_text(i,"J"+str(i+1)+(" · trasladar aquí" if occupied.has(i+1) else ""))
		if cat=="player":
			_spawn_slot.select(clampi(int(point.get("playerSlot",1))-1,0,SPAWNS.MAX_PLAYERS-1))
		else:
			_spawn_slot.select(0)
		if cat=="player":
			var selected_slot:=int(point.get("playerSlot",0))
			_spawn_info.text="J1 · aparición del personaje" if selected_slot==1 else "J"+str(selected_slot)+" · no aparece en Play"
		else:
			_spawn_info.text=str(SPAWN_NAMES.get(cat,"Punto"))+" · selecciona Jugador para trasladar aquí la aparición J1"
	elif _spawn_area_form.visible:
		_spawn_area_name.text=str(area.get("name",""))
		var type_index := SPAWNS.AREA_CATEGORIES.find(str(area.get("type","trees")))
		if type_index>=0:
			_spawn_area_type.select(type_index)
		var biome_index := SPAWNS.BIOME_IDS.find(str(area.get("biome","any")))
		if biome_index>=0:
			_spawn_area_biome.select(biome_index)
		_spawn_density.set_value_no_signal(float(area.get("density",40)))
		_spawn_density_label.text=str(int(area.get("density",40)))+"%"
		_spawn_area_hidden.set_pressed_no_signal(bool(area.get("hidden",false)))
		_spawn_vertex_picker.clear()
		var points: Array = area.get("points",[])
		_spawn_selected_vertex=clampi(_spawn_selected_vertex,0,maxi(0,points.size()-1))
		for i in range(points.size()):
			_spawn_vertex_picker.add_item("V"+str(i+1))
		if not points.is_empty():
			_spawn_vertex_picker.select(_spawn_selected_vertex)
			_spawn_vertex_x.set_value_no_signal(float(points[_spawn_selected_vertex].get("x",0)))
			_spawn_vertex_z.set_value_no_signal(float(points[_spawn_selected_vertex].get("z",0)))
		_spawn_info.text=""
	else:
		_spawn_info.text=""
	_updating_spawn_controls=false


func _on_spawn_category_selected(index: int) -> void:
	if _updating_spawn_controls or _selected_spawn().is_empty():
		return
	var cat: String=SPAWNS.POINT_CATEGORIES[index]
	# The active Explorer is J1. Assigning a new marker as Jugador
	# moves J1 here by default; J2–J6 can still be selected afterward.
	if cat=="player":
		_spawn_slot.select(0)
	_spawn_slot.visible=cat=="player"
	_apply_point_type(cat)

func _on_spawn_slot_selected(_index: int) -> void:
	if _updating_spawn_controls or _selected_spawn().is_empty():
		return
	_apply_point_type("player")


func _apply_point_type(cat: String) -> void:
	var result: Dictionary=_store.spawn_change_point_category(_current_spawn_id,cat,_spawn_slot.selected+1)
	if _commit_spawn(result,"Tipo de punto actualizado."):
		_update_spawn_info()
		_save_player_one_spawn_for_play(_current_spawn_id)
	elif not bool(result.get("ok",false)):
		_update_spawn_info()


func _set_spawn_mode(mode: String) -> void:
	if _get_world()==null:
		_status.text="Abre el escenario 3D primero."
		return
	if mode=="move_point" and _selected_spawn().is_empty():
		_status.text="Selecciona un punto."
		return
	if mode=="move_vertex" and _selected_spawn_area().is_empty():
		_status.text="Selecciona un área."
		return
	_spawn_mode=mode
	_spawn_dragging=false
	_spawn_drag_id=-1
	if mode!="point":
		SPAWN_VIEW.clear_cursor(_get_world())
	if mode=="area":
		_pending_spawn_area.clear()
		_status.text="Marca al menos 3 vértices en el terreno y pulsa el primero para cerrar."
	elif mode=="point":
		_status.text="Clic en el terreno para colocar."
	elif mode=="select":
		_status.text="Clic en un punto o dentro de un área."
	else:
		_status.text="Clic para mover."
	_redraw_spawn_overlay()


func _cancel_spawn_tool() -> void:
	_spawn_dragging=false
	_spawn_drag_id=-1
	_spawn_mode="select"
	_pending_spawn_area.clear()
	SPAWN_VIEW.clear_cursor(_get_world())
	_status.text=""
	_redraw_spawn_overlay()


func clear_spawn_preview() -> void:
	var world := _get_world()
	if world!=null:
		var overlay := world.get_node_or_null(SPAWN_VIEW.OVERLAY_NAME)
		if overlay!=null:
			world.remove_child(overlay)
			overlay.queue_free()
		SPAWN_VIEW.clear_cursor(world)


func _redraw_spawn_overlay() -> void:
	if _tabs==null or _tabs.current_tab!=2:
		clear_spawn_preview()
		return
	var world := _get_world()
	if world==null or _source.is_empty():
		return
	SPAWN_VIEW.refresh(world,_source,_pending_spawn_area,_selected_spawn_kind,
		_current_spawn_id if _selected_spawn_kind=="point" else _selected_spawn_area_id,
		_spawn_selected_vertex)


# Runtime Play reloads res://data/world.json in a separate scene.
# Persist J1 relocations immediately so F5 does not use a stale spawn.
# Called by EditorPlugin._build(), not by a click or a manual save.
# Transfer live data so F5 follows J1 even when there are pending changes.
func prepare_play_spawn_preview() -> bool:
	if _store.data.is_empty() and not _store.open():
		_status.text="No se pudo preparar Play: "+_store.last_error
		return false
	if not PLAY_SPAWN.prepare(_store.data):
		_status.text="No se pudo preparar Play: falta un punto J1 válido."
		return false
	var point: Dictionary=PLAY_SPAWN.player_one(_store.data)
	_status.text="Play desde J1: X "+str(snappedf(float(point.get("x",0)),0.01))+" · Z "+str(snappedf(float(point.get("z",0)),0.01))
	print("WILDTRAP_EDITOR_PLAY_J1 x=",point.get("x")," z=",point.get("z"))
	return true


func _save_player_one_spawn_for_play(point_id: int) -> void:
	var point := _selected_spawn()
	if int(point.get("id",-1))!=point_id:
		return
	if str(point.get("kind",""))!="playerSpawn" or int(point.get("playerSlot",0))!=1:
		return
	# Preview follows the editor immediately without silently saving
	# unrelated unsaved changes in the full canonical world.json.
	if PLAY_SPAWN.prepare(_store.data):
		_status.text="J1 listo para Play: X "+str(snappedf(float(point.get("x",0)),0.01))+" · Z "+str(snappedf(float(point.get("z",0)),0.01))+(". Pulsa Guardar para conservar el cambio." if _store.dirty else "")
	else:
		_status.text="No se pudo sincronizar J1 con Play."


func _commit_spawn(result: Dictionary, success_text: String) -> bool:
	if not bool(result.get("ok",false)):
		_status.text=str(result.get("error","No se pudo aplicar."))
		return false
	if not bool(result.get("changed",false)):
		_status.text="Sin cambios."
		return false
	_source=_store.data
	_update_save_buttons()
	_rebuild_spawn_buttons()
	_redraw_spawn_overlay()
	_status.text=success_text
	return true


func handle_spawn_viewport_input(camera: Camera3D, event: InputEvent) -> bool:
	if _tabs==null or _tabs.current_tab!=2 or _spawn_mode.is_empty():
		return false
	var world := _get_world()
	if world==null:
		return false
	if event is InputEventMouseMotion:
		var motion:=event as InputEventMouseMotion
		if _spawn_dragging:
			var surface: Variant=SPAWN_VIEW.pick_terrain(camera,motion.position,world)
			if surface is Vector3:
				_spawn_drag_position=surface
				SPAWN_VIEW.set_cursor(world,surface)
			return true
		if _spawn_mode=="point":
			if motion.alt_pressed or motion.ctrl_pressed or motion.shift_pressed:
				SPAWN_VIEW.set_cursor(world,null)
				return false
			SPAWN_VIEW.set_cursor(world,SPAWN_VIEW.pick_terrain(camera,motion.position,world))
		return false
	if not (event is InputEventMouseButton):
		return false
	var mouse:=event as InputEventMouseButton
	if mouse.button_index!=MOUSE_BUTTON_LEFT:
		return false
	if not mouse.pressed and _spawn_dragging:
		_spawn_dragging=false
		var point_id:=_spawn_drag_id
		_spawn_drag_id=-1
		SPAWN_VIEW.set_cursor(world,null)
		var updated := _commit_spawn(_store.spawn_move_point(point_id,_spawn_drag_position.x,_spawn_drag_position.z),"Punto movido.")
		_current_spawn_id=point_id
		_selected_spawn_kind="point"
		_update_spawn_info()
		if updated:
			_save_player_one_spawn_for_play(point_id)
			var moved_point:=_selected_spawn()
			if str(moved_point.get("kind",""))!="playerSpawn" or int(moved_point.get("playerSlot",0))!=1:
				_status.text="Punto movido. El personaje aparece exclusivamente en J1."
		return true
	if not mouse.pressed or mouse.alt_pressed or mouse.ctrl_pressed or mouse.shift_pressed:
		return false
	# Selection and movement are direct: no explicit move tool is needed.
	var marker: Dictionary=SPAWN_VIEW.closest_screen_point(_source,camera,mouse.position,world)
	if not marker.is_empty() and (_spawn_mode=="point" or _spawn_mode=="select"):
		var point_id:=int(marker.get("id",-1))
		_select_spawn(point_id)
		_spawn_drag_id=point_id
		_spawn_drag_position=Vector3(float(marker.get("x",0)),_terrain_y(float(marker.get("x",0)),float(marker.get("z",0))),float(marker.get("z",0)))
		_spawn_dragging=true
		return true
	var hit: Variant=SPAWN_VIEW.pick_terrain(camera,mouse.position,world)
	if not (hit is Vector3):
		_status.text="No se encontró terreno bajo el cursor."
		return false
	var near_first:=false
	if _spawn_mode=="area" and _pending_spawn_area.size()>=3:
		var first: Dictionary=_pending_spawn_area[0]
		var px:=float(first.get("x",0))
		var pz:=float(first.get("z",0))
		var pixel: Vector2=camera.unproject_position(Vector3(px,_terrain_y(px,pz)+2,pz))
		near_first=pixel.distance_to(mouse.position)<17.0
	return spawn_world_click(hit,near_first)


func spawn_world_click(hit: Vector3, near_first: bool = false) -> bool:
	# Direct-call entry is also used by headless tests. No scene writes here.
	if _spawn_mode.is_empty():
		return false
	var x := clampf(hit.x,-315.0,315.0)
	var z := clampf(hit.z,-315.0,315.0)
	if _spawn_mode=="point":
		# A click on an existing marker selects it instead of placing a duplicate.
		var existing: Dictionary=SPAWN_VIEW.closest_point(_source,x,z,1.6)
		if not existing.is_empty():
			_select_spawn(int(existing.get("id",-1)))
			SPAWN_VIEW.clear_cursor(_get_world())
			return true
		var result: Dictionary=_store.spawn_place_point("unassigned",x,z)
		if _commit_spawn(result,"Punto colocado. Haz clic en él para asignarle un tipo."):
			_current_spawn_id=int(result.get("id",-1))
			_selected_spawn_kind="point"
			_selected_spawn_area_id=""
			_rebuild_spawn_buttons()
			_update_spawn_info()
		return true
	if _spawn_mode=="area":
		if near_first:
			_close_spawn_polygon()
			return true
		if not _pending_spawn_area.is_empty():
			var last: Dictionary = _pending_spawn_area.back()
			if Vector2(float(last.get("x",0))-x,float(last.get("z",0))-z).length()<0.3:
				return true
		if _pending_spawn_area.size()>=128:
			_status.text="Máximo 128 vértices."
			return true
		_pending_spawn_area.append({"x":x,"z":z})
		_status.text=str(_pending_spawn_area.size())+" puntos"
		_redraw_spawn_overlay()
		return true
	if _spawn_mode=="select":
		var found: Dictionary = SPAWN_VIEW.closest_point(_source,x,z)
		if not found.is_empty():
			_select_spawn(int(found.get("id",-1)))
		else:
			var area: Dictionary = SPAWN_VIEW.containing_area(_source,x,z)
			if not area.is_empty():
				_select_spawn_area(str(area.get("id","")))
		return true
	if _spawn_mode=="move_point":
		if _commit_spawn(_store.spawn_move_point(_current_spawn_id,x,z),"Punto movido."):
			_spawn_mode="select"
		return true
	if _spawn_mode=="move_vertex":
		if _commit_spawn(_store.spawn_move_vertex(_selected_spawn_area_id,_spawn_selected_vertex,x,z),"Vértice movido."):
			_spawn_mode="select"
		return true
	return false


func _close_spawn_polygon() -> void:
	if _spawn_mode!="area":
		return
	var result: Dictionary = _store.spawn_create_area(_pending_spawn_area)
	if _commit_spawn(result,"Área creada."):
		_selected_spawn_area_id=str(result.get("id",""))
		_selected_spawn_kind="area"
		_pending_spawn_area.clear()
		_spawn_selected_vertex=0
		_spawn_mode="select"
		_rebuild_spawn_buttons()
		_redraw_spawn_overlay()


func _delete_selected_point() -> void:
	if _selected_spawn_kind!="point" or _selected_spawn().is_empty():
		_status.text="Selecciona un punto para eliminarlo."
		return
	_delete_selected_spawn()


func _apply_vertex_coordinates() -> void:
	_commit_spawn(_store.spawn_move_vertex(_selected_spawn_area_id,_spawn_selected_vertex,_spawn_vertex_x.value,_spawn_vertex_z.value),"Vértice movido.")


func _on_vertex_selected(index: int) -> void:
	if _updating_spawn_controls:
		return
	_spawn_selected_vertex=index
	_update_spawn_info()
	_redraw_spawn_overlay()


func _on_area_name_submitted(value: String) -> void:
	_edit_area("name",value)


func _on_area_name_focus_exited() -> void:
	if not _updating_spawn_controls:
		_edit_area("name",_spawn_area_name.text)


func _on_area_type_selected(index: int) -> void:
	if not _updating_spawn_controls:
		_edit_area("type",SPAWNS.AREA_CATEGORIES[index])


func _on_area_biome_selected(index: int) -> void:
	if not _updating_spawn_controls:
		_edit_area("biome",SPAWNS.BIOME_IDS[index])


func _on_density_preview(value: float) -> void:
	if _spawn_density_label!=null:
		_spawn_density_label.text=str(int(value))+"%"


func _on_density_committed(_value_changed: bool) -> void:
	if not _updating_spawn_controls:
		_edit_area("density",int(_spawn_density.value))


func _on_area_hidden_toggled(checked: bool) -> void:
	if not _updating_spawn_controls:
		_edit_area("hidden",checked)


func _edit_area(field: String, value: Variant) -> void:
	if _selected_spawn_area_id.is_empty():
		return
	_commit_spawn(_store.spawn_change_area(_selected_spawn_area_id,field,value),"Área actualizada.")


func _delete_selected_spawn() -> void:
	if _selected_spawn_kind=="area" and not _selected_spawn_area_id.is_empty():
		if _commit_spawn(_store.spawn_delete_area(_selected_spawn_area_id),"Área eliminada."):
			_selected_spawn_area_id=""
			_spawn_mode=""
	elif _selected_spawn_kind=="point" and _current_spawn_id>=0:
		if _commit_spawn(_store.spawn_delete_point(_current_spawn_id),"Punto eliminado."):
			_current_spawn_id=-1
			_spawn_mode=""
	_rebuild_spawn_buttons()
	_redraw_spawn_overlay()


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
