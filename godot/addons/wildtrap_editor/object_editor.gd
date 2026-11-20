@tool
extends VBoxContainer
## Native Godot editor object palette; 15 exact legacy prefab IDs.
const OBJECTS=preload("res://addons/wildtrap_editor/object_rules.gd")
const PICK=preload("res://addons/wildtrap_editor/spawn_viewport.gd")
var host: Control
var store: RefCounted
var _mode: String=""
var _catalog: Array=[]
var _active_prefab: String=""
var _selected_id: int=-1
var _palette: ItemList
var _instances: OptionButton
var _position_x: SpinBox
var _position_z: SpinBox
var _rotation: SpinBox
var _scale: SpinBox
var _height: SpinBox
var _hidden: CheckButton
var _intangible: CheckButton
var _props: VBoxContainer
var _status: Label
var _updating:=false


func configure(source_store: RefCounted,source_host: Control) -> void:
	store=source_store
	host=source_host
	_catalog=OBJECTS.catalog()
	if is_inside_tree():
		_palette.clear()
		for entry in _catalog:
			_palette.add_item(str(entry.get("name","")))
		refresh()


func _ready() -> void:
	_palette=ItemList.new()
	_palette.name="ObjectPalette"
	_palette.custom_minimum_size=Vector2(0,220)
	_palette.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	_palette.item_selected.connect(_on_palette_selected)
	add_child(_palette)
	for item in _catalog:
		_palette.add_item(str(item.get("name","")))
	var actions:=HBoxContainer.new()
	add_child(actions)
	_button(actions,"Colocar",_set_mode.bind("place"))
	_button(actions,"Seleccionar",_set_mode.bind("select"))
	_button(actions,"Mover",_set_mode.bind("move"))
	_button(actions,"Cancelar",_cancel)
	_status=_label(self,"")
	_instances=OptionButton.new()
	_instances.name="SceneObjects"
	_instances.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	_instances.item_selected.connect(_on_instance_selected)
	add_child(_instances)
	_props=VBoxContainer.new()
	_props.name="ObjectProperties"
	add_child(_props)
	var coords:=HBoxContainer.new()
	_props.add_child(coords)
	_position_x=_spin(coords,-315.0,315.0,0.25)
	_position_z=_spin(coords,-315.0,315.0,0.25)
	var transforms:=HBoxContainer.new()
	_props.add_child(transforms)
	_rotation=_spin(transforms,-360.0,360.0,1.0)
	_scale=_spin(transforms,0.01,30.0,0.05)
	_height=_spin(_props,-1000.0,2000.0,0.25)
	_position_x.prefix="X "
	_position_z.prefix="Z "
	_rotation.prefix="Y° "
	_scale.prefix="× "
	_height.prefix="Y "
	_button(_props,"Aplicar posición, rotación y escala",_apply_transform)
	_hidden=CheckButton.new()
	_hidden.text="Ocultar en editor"
	_hidden.toggled.connect(_on_hidden)
	_props.add_child(_hidden)
	_intangible=CheckButton.new()
	_intangible.text="Intangible en editor"
	_intangible.toggled.connect(_on_intangible)
	_props.add_child(_intangible)
	_button(_props,"Eliminar objeto",_delete)
	_props.visible=false
	refresh()


func _label(where: Node,label_text: String) -> Label:
	var l:=Label.new()
	l.text=label_text
	l.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART
	where.add_child(l)
	return l


func _button(where: Node,label_text: String,callback: Callable) -> Button:
	var button:=Button.new()
	button.text=label_text
	button.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	button.pressed.connect(callback)
	where.add_child(button)
	return button


func _spin(where: Node,minimum: float,maximum: float,step_value: float) -> SpinBox:
	var input:=SpinBox.new()
	input.min_value=minimum
	input.max_value=maximum
	input.step=step_value
	input.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	where.add_child(input)
	return input


func _on_palette_selected(index: int) -> void:
	if index<0 or index>=_catalog.size():
		return
	_active_prefab=str(_catalog[index].get("id",""))
	_status.text=str(_catalog[index].get("name",""))


func _set_mode(action: String) -> void:
	if store==null or host==null or host.call("_get_world")==null:
		_status.text="Abre scenes/main.tscn."
		return
	if action=="place" and _active_prefab.is_empty():
		_status.text="Selecciona un modelo."
		return
	if action=="move" and _selected_id<0:
		_status.text="Selecciona un objeto."
		return
	_mode=action
	_status.text="Clic en el terreno."


func _cancel() -> void:
	_mode=""
	_status.text=""


func deactivate() -> void:
	_mode=""


func refresh() -> void:
	if not is_node_ready() or store==null or _instances==null:
		return
	var previous_id:=_selected_id
	_instances.clear()
	var ids: Array[int]=[]
	for node in store.data.get("nodes",[]):
		if not (node is Dictionary) or str(node.get("kind",""))!="prefab":
			continue
		var identifier:=int(node.get("id",-1))
		var name_text:=str(OBJECTS.by_id(str(node.get("prefabId",""))).get("name",node.get("prefabId","Objeto")))
		_instances.add_item(name_text+" #"+str(identifier))
		ids.append(identifier)
	if ids.is_empty():
		_selected_id=-1
	else:
		var index:=ids.find(previous_id)
		if index<0:
			index=0
		_selected_id=ids[index]
		_instances.select(index)
	_instances.set_meta("ids",ids)
	_update_form()


func _on_instance_selected(index: int) -> void:
	var ids: Array=_instances.get_meta("ids",[])
	if index<0 or index>=ids.size():
		return
	_selected_id=int(ids[index])
	_update_form()


func _update_form() -> void:
	if _props==null:
		return
	var record: Dictionary=OBJECTS.find_node(store.data,_selected_id) if store!=null else {}
	_props.visible=not record.is_empty()
	if record.is_empty():
		return
	_updating=true
	_position_x.set_value_no_signal(float(record.get("x",0)))
	_position_z.set_value_no_signal(float(record.get("z",0)))
	_rotation.set_value_no_signal(rad_to_deg(float(record.get("rotation",0))))
	_scale.set_value_no_signal(float(record.get("scale",1)))
	var actual_height:=float(record.get("y",0))
	if not record.has("y") and host!=null:
		var world:=host.call("_get_world") as Node3D
		if world!=null and world.has_method("_height_at"):
			actual_height=float(world.call("_height_at",float(record.get("x",0)),float(record.get("z",0))))+float(record.get("offsetY",0))
	_height.set_value_no_signal(actual_height)
	_height.visible=bool(OBJECTS.by_id(str(record.get("prefabId",""))).get("freeCave",false))
	_hidden.set_pressed_no_signal(bool(record.get("editorHidden",false)))
	_intangible.set_pressed_no_signal(bool(record.get("editorIntangible",false)))
	_updating=false


func _commit(result: Dictionary) -> bool:
	if not bool(result.get("ok",false)):
		_status.text=str(result.get("error","No se pudo editar."))
		return false
	if not bool(result.get("changed",false)):
		return false
	if host!=null:
		host.call("external_editor_changed","objects")
	refresh()
	_status.text="Cambio sin guardar."
	return true


func _apply_transform() -> void:
	if store==null or _selected_id<0:
		return
	var fields: Dictionary={
		"x":_position_x.value,
		"z":_position_z.value,
		"rotation":deg_to_rad(_rotation.value),
		"scale":_scale.value
	}
	var current:=OBJECTS.find_node(store.data,_selected_id)
	if bool(OBJECTS.by_id(str(current.get("prefabId",""))).get("freeCave",false)):
		fields["y"]=_height.value
	for key in fields:
		var result: Dictionary=store.object_edit(_selected_id,str(key),fields[key])
		if not bool(result.get("ok",false)):
			_status.text=str(result.get("error",""))
			break
	if host!=null:
		host.call("external_editor_changed","objects")
	refresh()


func _on_hidden(enabled: bool) -> void:
	if not _updating and store!=null and _selected_id>=0:
		_commit(store.object_edit(_selected_id,"editorHidden",enabled))


func _on_intangible(enabled: bool) -> void:
	if not _updating and store!=null and _selected_id>=0:
		_commit(store.object_edit(_selected_id,"editorIntangible",enabled))


func _delete() -> void:
	if store!=null and _selected_id>=0:
		_commit(store.object_erase(_selected_id))


func handle_3d_input(camera: Camera3D,event: InputEvent) -> bool:
	if _mode.is_empty() or host==null or store==null:
		return false
	if not (event is InputEventMouseButton):
		return false
	var mouse:=event as InputEventMouseButton
	if not mouse.pressed or mouse.button_index!=MOUSE_BUTTON_LEFT or mouse.alt_pressed or mouse.ctrl_pressed or mouse.shift_pressed:
		return false
	var world:=host.call("_get_world") as Node3D
	var hit: Variant=PICK.pick_terrain(camera,mouse.position,world)
	if not (hit is Vector3):
		return false
	return handle_terrain_hit(hit)


func handle_terrain_hit(hit: Vector3) -> bool:
	if _mode.is_empty() or store==null:
		return false
	var x:=clampf(hit.x,-315.0,315.0)
	var z:=clampf(hit.z,-315.0,315.0)
	if _mode=="place":
		var result: Dictionary=store.object_place(_active_prefab,x,z)
		if bool(result.get("ok",false)):
			_selected_id=int(result.get("id",-1))
		_commit(result)
		return true
	if _mode=="move":
		var first: Dictionary=store.object_edit(_selected_id,"x",x)
		var second: Dictionary=store.object_edit(_selected_id,"z",z)
		if bool(first.get("changed",false)) or bool(second.get("changed",false)):
			if host!=null:
				host.call("external_editor_changed","objects")
			refresh()
		elif not bool(first.get("ok",false)) or not bool(second.get("ok",false)):
			_status.text="No se pudo mover."
		_mode="select"
		return true
	if _mode=="select":
		var best:=18.0*18.0
		var closest:=-1
		for item in store.data.get("nodes",[]):
			if not (item is Dictionary) or str(item.get("kind",""))!="prefab":
				continue
			var d:=Vector2(float(item.get("x",0))-x,float(item.get("z",0))-z).length_squared()
			if d<best:
				best=d
				closest=int(item.get("id",-1))
		if closest>=0:
			_selected_id=closest
			refresh()
		return true
	return false


func summary() -> Dictionary:
	return {"catalog":_catalog.size(),"placed":_instances.item_count if _instances!=null else 0,"selected_id":_selected_id}
