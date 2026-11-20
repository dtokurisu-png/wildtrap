@tool
extends VBoxContainer
## Drag original 3D thumbnails to the native editor viewport. No placement
## action buttons, no separate cave dropdown; select existing models directly.
const OBJECTS=preload("res://addons/wildtrap_editor/object_rules.gd")
const PICK=preload("res://addons/wildtrap_editor/spawn_viewport.gd")
const GHOST_NAME="__WT_ObjectDragGhost"

var host: Control
var store: RefCounted
var _catalog: Array=[]
var _tiles: Dictionary={}
var _palette: GridContainer
var _previewer: EditorResourcePreview
var _mode: String=""
var _active_prefab: String=""
var _selected_id: int=-1
var _dragging:=false
var _over_3d:=false
var _ghost: Node3D
var _drag_position:=Vector3.ZERO
var _props: VBoxContainer
var _position_x: SpinBox
var _position_z: SpinBox
var _rotation: SpinBox
var _scale: SpinBox
var _status: Label
var _updating:=false


func configure(source_store: RefCounted,source_host: Control) -> void:
	store=source_store
	host=source_host
	_catalog=OBJECTS.catalog()
	if is_node_ready():
		_fill_gallery()
		refresh()


func _ready() -> void:
	_palette=GridContainer.new()
	_palette.name="ObjectPalette"
	_palette.columns=3
	_palette.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	add_child(_palette)
	_status=Label.new()
	_status.name="ObjectStatus"
	_status.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART
	add_child(_status)
	_props=VBoxContainer.new()
	_props.name="ObjectProperties"
	add_child(_props)
	var transform_row:=HBoxContainer.new()
	_props.add_child(transform_row)
	_position_x=_spin(transform_row,-315.0,315.0,"X")
	_position_z=_spin(transform_row,-315.0,315.0,"Z")
	var other_row:=HBoxContainer.new()
	_props.add_child(other_row)
	_rotation=_spin(other_row,-360.0,360.0,"Y°")
	_scale=_spin(other_row,0.01,30.0,"×")
	var apply_button:=Button.new()
	apply_button.text="Aplicar"
	apply_button.pressed.connect(_apply_transform)
	_props.add_child(apply_button)
	var controls:=HBoxContainer.new()
	_props.add_child(controls)
	var hide:=Button.new()
	hide.name="HideObject"
	hide.text="Ocultar/mostrar"
	hide.pressed.connect(_toggle_hidden)
	controls.add_child(hide)
	var delete:=Button.new()
	delete.text="Eliminar"
	delete.pressed.connect(_delete)
	controls.add_child(delete)
	_props.visible=false
	if Engine.is_editor_hint():
		_previewer=EditorInterface.get_resource_previewer()
	_fill_gallery()
	refresh()


func _spin(parent: Node,min_value: float,max_value: float,prefix_text: String) -> SpinBox:
	var s:=SpinBox.new()
	s.min_value=min_value
	s.max_value=max_value
	s.step=0.05
	s.prefix=prefix_text
	s.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	parent.add_child(s)
	return s


func _fill_gallery() -> void:
	if _palette==null:
		return
	for child in _palette.get_children():
		child.queue_free()
	_tiles.clear()
	for item in _catalog:
		if not (item is Dictionary):
			continue
		var id_text:=str(item.get("id",""))
		var tile:=Button.new()
		tile.name="Model_"+id_text.replace("-","_")
		tile.text=str(item.get("name",""))
		tile.tooltip_text=str(item.get("name",""))
		tile.custom_minimum_size=Vector2(107,104)
		tile.size_flags_horizontal=Control.SIZE_EXPAND_FILL
		tile.expand_icon=true
		tile.icon_alignment=HORIZONTAL_ALIGNMENT_CENTER
		tile.vertical_icon_alignment=VERTICAL_ALIGNMENT_TOP
		tile.alignment=HORIZONTAL_ALIGNMENT_CENTER
		tile.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART
		tile.gui_input.connect(_tile_input.bind(id_text))
		_palette.add_child(tile)
		_tiles[id_text]=tile
		if _previewer!=null:
			var path:=str(item.get("path",""))
			if ResourceLoader.exists(path):
				_previewer.queue_resource_preview(path,self,"_thumbnail_ready",id_text)


func _thumbnail_ready(_path: String,preview: Texture2D,thumbnail: Texture2D,id_text: String) -> void:
	if not is_inside_tree() or not _tiles.has(id_text):
		return
	var tile:=_tiles[id_text] as Button
	if not is_instance_valid(tile):
		return
	tile.icon=thumbnail if thumbnail!=null else preview


func _tile_input(event: InputEvent,id_text: String) -> void:
	if not (event is InputEventMouseButton):
		return
	var click:=event as InputEventMouseButton
	if click.button_index!=MOUSE_BUTTON_LEFT:
		return
	if click.pressed:
		_active_prefab=id_text
		_mode="place"
		_dragging=true
		_over_3d=false
		_start_ghost()
		_status.text=str(OBJECTS.by_id(id_text).get("name",id_text))
	elif _dragging and not _over_3d:
		# If released in the panel, simply cancel; do not place at a guess.
		_cancel_ghost()
		_dragging=false
		_mode=""


func _on_palette_selected(index: int) -> void:
	# Compatible with earlier headless integration tests, not exposed as UI.
	if index>=0 and index<_catalog.size():
		_active_prefab=str(_catalog[index].get("id",""))


func _set_mode(mode: String) -> void:
	# Test hook. In actual UI drag starts from a thumbnail mouse-down.
	_mode=mode


func _world() -> Node3D:
	if host==null:
		return null
	return host.call("_get_world") as Node3D


func _start_ghost() -> void:
	_cancel_ghost()
	var world:=_world()
	var data:=OBJECTS.by_id(_active_prefab)
	if world==null or data.is_empty():
		return
	var packed:=load(str(data.get("path",""))) as PackedScene
	if packed==null:
		return
	var root:=Node3D.new()
	root.name=GHOST_NAME
	root.set_meta("wildtrap_editor_marker",true)
	root.visible=false
	world.add_child(root)
	var source:=packed.instantiate() as Node3D
	if source==null:
		root.queue_free()
		return
	root.add_child(source)
	var low:=Vector3(INF,INF,INF)
	var high:=Vector3(-INF,-INF,-INF)
	var count:=0
	for child in source.find_children("*","MeshInstance3D",true,false):
		var model:=child as MeshInstance3D
		if model.mesh==null:
			continue
		var b:=model.get_aabb()
		var mat:=source.global_transform.affine_inverse()*model.global_transform
		for ix in range(2):
			for iy in range(2):
				for iz in range(2):
					var xyz:=b.position+b.size*Vector3(float(ix),float(iy),float(iz))
					var transformed:=mat*xyz
					low=low.min(transformed)
					high=high.max(transformed)
		count+=1
		model.transparency=0.5
		model.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	if count>0:
		var size:=high-low
		var longest:=maxf(size.x,maxf(size.y,size.z))
		if longest>0.0001:
			var scalar:=float(data.get("span",46))/longest
			source.scale=Vector3.ONE*scalar
			source.position=Vector3(-(low.x+high.x)*0.5,-low.y,-(low.z+high.z)*0.5)*scalar
	_ghost=root


func _cancel_ghost() -> void:
	if is_instance_valid(_ghost):
		var parent:=_ghost.get_parent()
		if parent!=null:
			parent.remove_child(_ghost)
		_ghost.queue_free()
	_ghost=null


func deactivate() -> void:
	_mode=""
	_dragging=false
	_over_3d=false
	_cancel_ghost()


func refresh() -> void:
	if not is_node_ready() or store==null or _props==null:
		return
	var obj:=OBJECTS.find_node(store.data,_selected_id)
	_props.visible=not obj.is_empty()
	if obj.is_empty():
		return
	_updating=true
	_position_x.set_value_no_signal(float(obj.get("x",0)))
	_position_z.set_value_no_signal(float(obj.get("z",0)))
	_rotation.set_value_no_signal(rad_to_deg(float(obj.get("rotation",0))))
	_scale.set_value_no_signal(float(obj.get("scale",1)))
	_updating=false


func _commit(result: Dictionary) -> bool:
	if not bool(result.get("ok",false)):
		_status.text=str(result.get("error","Operación inválida."))
		return false
	if not bool(result.get("changed",false)):
		return false
	if host!=null:
		host.call("external_editor_changed","objects")
	refresh()
	return true


func _apply_transform() -> void:
	if store==null or _selected_id<0:
		return
	for change in [
		{"property":"x","value":_position_x.value},
		{"property":"z","value":_position_z.value},
		{"property":"rotation","value":deg_to_rad(_rotation.value)},
		{"property":"scale","value":_scale.value}
	]:
		var result: Dictionary=store.object_edit(_selected_id,str(change["property"]),change["value"])
		if not bool(result.get("ok",false)):
			_status.text=str(result.get("error",""))
			return
	if host!=null:
		host.call("external_editor_changed","objects")
	refresh()


func _toggle_hidden() -> void:
	if store!=null and _selected_id>=0:
		var node:=OBJECTS.find_node(store.data,_selected_id)
		_commit(store.object_edit(_selected_id,"editorHidden",not bool(node.get("editorHidden",false))))


func _delete() -> void:
	if store!=null and _selected_id>=0:
		if _commit(store.object_erase(_selected_id)):
			_selected_id=-1
			refresh()


func _closest_existing(hit: Vector3, radius: float=15.0) -> int:
	if store==null:
		return -1
	var best:=radius*radius
	var selected:=-1
	for entry in store.data.get("nodes",[]):
		if not (entry is Dictionary) or str(entry.get("kind",""))!="prefab":
			continue
		var d:=Vector2(float(entry.get("x",0))-hit.x,float(entry.get("z",0))-hit.z).length_squared()
		if d<best:
			best=d
			selected=int(entry.get("id",-1))
	return selected


func _hit_existing_model(camera: Camera3D,screen_position: Vector2) -> int:
	# The cave can be clicked anywhere on its geometry, not just at its
	# center footprint. Bounding boxes are a fast broad-phase approximation.
	var world:=_world()
	if world==null or store==null:
		return -1
	var ray_origin:=camera.project_ray_origin(screen_position)
	var ray_dir:=camera.project_ray_normal(screen_position).normalized()
	var closest:=INF
	var picked:=-1
	for record in store.data.get("nodes",[]):
		if not (record is Dictionary) or str(record.get("kind",""))!="prefab":
			continue
		var prefab:=str(record.get("prefabId",""))
		var id_num:=int(record.get("id",-1))
		var root:=world.get_node_or_null("Prefab_%s_%d" % [prefab,id_num]) as Node3D
		if root==null or not root.visible:
			continue
		var low:=Vector3(INF,INF,INF)
		var high:=Vector3(-INF,-INF,-INF)
		for entry in root.find_children("*","MeshInstance3D",true,false):
			var part:=entry as MeshInstance3D
			if part.mesh==null:
				continue
			var box:=part.get_aabb()
			for i in range(2):
				for j in range(2):
					for k in range(2):
						var v:=box.position+box.size*Vector3(float(i),float(j),float(k))
						var w:=part.global_transform*v
						low=low.min(w)
						high=high.max(w)
		if not is_finite(low.x):
			continue
		var tmin:=0.0
		var tmax:=5000.0
		for axis in range(3):
			var start:=ray_origin[axis]
			var direction:=ray_dir[axis]
			if absf(direction)<0.00000001:
				if start<low[axis] or start>high[axis]:
					tmax=-1.0
					break
			else:
				var t0: float=(low[axis]-start)/direction
				var t1: float=(high[axis]-start)/direction
				tmin=maxf(tmin,minf(t0,t1))
				tmax=minf(tmax,maxf(t0,t1))
		if tmax>=tmin and tmin<closest:
			closest=tmin
			picked=id_num
	return picked


func handle_3d_input(camera: Camera3D,event: InputEvent) -> bool:
	if host==null or store==null:
		return false
	if _dragging:
		if event is InputEventMouseMotion:
			_over_3d=true
			var point: Variant=PICK.pick_terrain(camera,(event as InputEventMouseMotion).position,_world())
			if point is Vector3:
				_drag_position=point
				if is_instance_valid(_ghost):
					_ghost.global_position=point
					_ghost.visible=true
			return true
		if event is InputEventMouseButton:
			var click:=event as InputEventMouseButton
			if click.button_index==MOUSE_BUTTON_LEFT and not click.pressed:
				var point: Variant=PICK.pick_terrain(camera,click.position,_world())
				var result:=false
				if point is Vector3:
					result=handle_terrain_hit(point)
				deactivate()
				return result
		return false
	if event is InputEventMouseButton:
		var click:=event as InputEventMouseButton
		if click.button_index==MOUSE_BUTTON_LEFT and click.pressed and not click.alt_pressed and not click.shift_pressed:
			# Pick a GLB by its true world-space bounds, including cave roofs.
			var id_num:=_hit_existing_model(camera,click.position)
			if id_num<0:
				var hit: Variant=PICK.pick_terrain(camera,click.position,_world())
				if hit is Vector3:
					id_num=_closest_existing(hit)
			if id_num>=0:
				_selected_id=id_num
				refresh()
				return true
	return false


func handle_terrain_hit(hit: Vector3) -> bool:
	if store==null:
		return false
	if _mode=="place":
		if _active_prefab.is_empty():
			return false
		var result: Dictionary=store.object_place(_active_prefab,clampf(hit.x,-315,315),clampf(hit.z,-315,315))
		if bool(result.get("ok",false)):
			_selected_id=int(result.get("id",-1))
		return _commit(result)
	return false


func summary() -> Dictionary:
	var placed:=0
	if store!=null:
		for node in store.data.get("nodes",[]):
			if node is Dictionary and str(node.get("kind",""))=="prefab":
				placed+=1
	return {"catalog":_catalog.size(),"placed":placed,"selected_id":_selected_id,"tiles":_tiles.size()}
