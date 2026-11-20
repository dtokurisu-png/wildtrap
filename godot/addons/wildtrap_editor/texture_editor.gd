@tool
extends VBoxContainer
## Material controls. All five biome base/cliff layers, 15 real RGBA decals,
## and one global hand-painted underlay are edited in the native Godot dock.
const BIOMES:=["forest","desert","plains","swamp","mountain"]
const NAMES:=["Bosque","Desierto","Pradera","Pantano","Montaña"]
const SLOTS:=["ground","detail1","detail2","detail3","cliff"]
const SLOT_LABELS:=["Suelo base","Complementaria 1","Complementaria 2","Complementaria 3","Acantilado"]
const BLENDS:=["Normal","Multiplicar","Trama","Superposición","Luz suave","Luz fuerte","Color","Luminosidad"]
var store: RefCounted
var host: Control
var _biome: OptionButton
var _slot: OptionButton
var _asset: OptionButton
var _library: Dictionary={}
var _image: TextureRect
var _scale: SpinBox
var _opacity: SpinBox
var _contrast: SpinBox
var _saturation: SpinBox
var _art_opacity: SpinBox
var _art_contrast: SpinBox
var _art_rotation: SpinBox
var _art_blend: OptionButton
var _ground_transparency: SpinBox
var _ground_feather: SpinBox
var _preview_toggles: Dictionary={}
var _info: Label
var _refreshing:=false


func configure(source_store: RefCounted,source_host: Control) -> void:
	store=source_store
	host=source_host
	var parsed: Variant=JSON.parse_string(FileAccess.get_file_as_string("res://data/detail-textures.json"))
	_library=parsed if parsed is Dictionary else {}
	if is_inside_tree():
		_asset.clear()
		for key in _library.keys():
			_asset.add_item(str(key).trim_suffix(".png"))
		refresh()


func _ready() -> void:
	# 1. Per-biome layer controls; only properties belonging to that layer.
	var materials_section:=VBoxContainer.new()
	materials_section.name="BiomeLayers"
	add_child(materials_section)
	_biome=_selector(materials_section,NAMES,"MaterialBiome")
	_slot=_selector(materials_section,SLOT_LABELS,"MaterialLayer")
	_biome.item_selected.connect(_on_selection)
	_slot.item_selected.connect(_on_selection)
	_image=TextureRect.new()
	_image.name="MaterialImage"
	_image.custom_minimum_size=Vector2(0,115)
	_image.expand_mode=TextureRect.EXPAND_IGNORE_SIZE
	_image.stretch_mode=TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	materials_section.add_child(_image)
	_asset=OptionButton.new()
	_asset.name="DetailAsset"
	_asset.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	for key in _library.keys():
		_asset.add_item(str(key).trim_suffix(".png"))
	_asset.item_selected.connect(_on_texture_changed)
	materials_section.add_child(_asset)
	_scale=_number_row("Repeticiones",0.25,1000.0,0.25,materials_section)
	_opacity=_number_row("Intensidad %",0.0,100.0,1.0,materials_section)
	_contrast=_number_row("Contraste %",0.0,300.0,1.0,materials_section)
	_saturation=_number_row("Saturación %",0.0,300.0,1.0,materials_section)
	_button(materials_section,"Aplicar material",_apply_material)

	# 2. Shared GROUND blending. Transparency 0% means opaque ground.
	var ground_section:=VBoxContainer.new()
	ground_section.name="GroundMix"
	add_child(ground_section)
	_heading(ground_section,"Suelo · mezcla")
	_ground_transparency=_number_row("Transparencia %",0.0,100.0,1.0,ground_section)
	_ground_feather=_number_row("Difuminado (m)",0.0,20.0,0.5,ground_section)
	_art_blend=_selector(ground_section,BLENDS,"HandpaintBlend")
	_button(ground_section,"Aplicar suelo",_apply_ground_mix)
	var controls:=HBoxContainer.new()
	controls.name="MaterialVisibility"
	ground_section.add_child(controls)
	for entry in [{"id":"details","name":"Complementarias"},{"id":"cliffs","name":"Acantilados"}]:
		var check:=CheckButton.new()
		check.name="Material_"+str(entry["id"])
		check.text=str(entry["name"])
		check.set_pressed_no_signal(true)
		check.toggled.connect(_toggle_visibility.bind(str(entry["id"])))
		controls.add_child(check)
		_preview_toggles[str(entry["id"])]=check

	# 3. Original HAND PAINTING image, with its own preview and settings.
	var art_section:=VBoxContainer.new()
	art_section.name="Handpainting"
	add_child(art_section)
	_heading(art_section,"Hand painting")
	var art_preview:=TextureRect.new()
	art_preview.name="HandpaintImage"
	art_preview.custom_minimum_size=Vector2(0,160)
	art_preview.expand_mode=TextureRect.EXPAND_IGNORE_SIZE
	art_preview.stretch_mode=TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	art_preview.texture=load("res://assets/textures/handpaint_reference.webp") as Texture2D
	art_section.add_child(art_preview)
	var art_toggle:=CheckButton.new()
	art_toggle.name="Material_handpaint"
	art_toggle.text="Superponer pintura"
	art_toggle.set_pressed_no_signal(true)
	art_toggle.toggled.connect(_toggle_visibility.bind("handpaint"))
	art_section.add_child(art_toggle)
	_preview_toggles["handpaint"]=art_toggle
	_art_opacity=_number_row("Pintura %",0.0,100.0,1.0,art_section)
	_art_contrast=_number_row("Negros %",0.0,400.0,1.0,art_section)
	_art_rotation=_number_row("Rotación °",-360.0,360.0,1.0,art_section)
	_button(art_section,"Aplicar pintura",_apply_handpaint)
	_info=Label.new()
	_info.name="TextureStatus"
	_info.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART
	add_child(_info)
	for spin in [_scale,_opacity,_contrast,_saturation,_ground_transparency,_ground_feather,_art_opacity,_art_contrast,_art_rotation]:
		spin.value_changed.connect(_preview_changes)
	_art_blend.item_selected.connect(_on_blend_changed)
	refresh()


func _heading(where: Node,title_text: String) -> void:
	var heading:=Label.new()
	heading.text=title_text
	heading.add_theme_font_size_override("font_size",15)
	where.add_child(heading)


func _selector(where: Node,items: Array,identifier: String) -> OptionButton:
	var item:=OptionButton.new()
	item.name=identifier
	item.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	for name_text in items:
		item.add_item(str(name_text))
	where.add_child(item)
	return item


func _number_row(title: String,min_value: float,max_value: float,step_value: float,where: Node=null) -> SpinBox:
	var row:=HBoxContainer.new()
	if where==null:
		add_child(row)
	else:
		where.add_child(row)
	var label:=Label.new()
	label.text=title
	label.custom_minimum_size=Vector2(95,0)
	row.add_child(label)
	var spin:=SpinBox.new()
	spin.min_value=min_value
	spin.max_value=max_value
	spin.step=step_value
	spin.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	row.add_child(spin)
	return spin


func _button(where: Node,label_text: String,cb: Callable) -> Button:
	var button:=Button.new()
	button.text=label_text
	button.pressed.connect(cb)
	where.add_child(button)
	return button


func _biome_id() -> String:
	return BIOMES[clampi(_biome.selected,0,BIOMES.size()-1)]


func _slot_id() -> String:
	return SLOTS[clampi(_slot.selected,0,SLOTS.size()-1)]


func _on_selection(_index: int) -> void:
	refresh_fields()
	if store!=null and host!=null:
		var world:=host.call("_get_world") as Node3D
		if world!=null and world.has_method("apply_editor_material_preview"):
			world.call("apply_editor_material_preview",store.data)


func _on_texture_changed(_index: int) -> void:
	_preview_changes(0.0)


func _on_blend_changed(_index: int) -> void:
	_preview_changes(0.0)


func refresh() -> void:
	if not is_node_ready() or store==null or _biome==null:
		return
	refresh_fields()


func refresh_fields() -> void:
	if store==null or _biome==null:
		return
	_refreshing=true
	var biome:=_biome_id()
	var slot:=_slot_id()
	var materials: Dictionary=store.data.get("biomeMaterials",{})
	var config: Dictionary=materials.get(biome,{})
	var properties: Dictionary=config.get("slots",{}).get(slot,{})
	var cliff: Dictionary=store.data.get("cliffHeightSettings",{}).get("biomes",{}).get(biome,{})
	var repetitions:=float(properties.get("scale",200.0))
	var intensity:=float(properties.get("opacity",0.5))
	if slot=="cliff":
		repetitions=float(cliff.get("repeats",50.0 if biome=="plains" else 26.25))
		intensity=float(cliff.get("intensity",1.0))
	_scale.min_value=3.5 if slot=="cliff" else 0.25
	_scale.max_value=315.0 if slot=="cliff" else 1000.0
	_scale.set_value_no_signal(repetitions)
	_opacity.set_value_no_signal(intensity*100.0)
	_contrast.set_value_no_signal(float(config.get("colorContrast",1.0))*100.0)
	_saturation.set_value_no_signal(float(config.get("colorSaturation",1.0))*100.0)
	var detail:=slot.begins_with("detail")
	_asset.visible=detail
	_contrast.visible=not (slot=="cliff")
	_saturation.visible=not (slot=="cliff")
	var path: String=""
	if detail:
		var keys: Array=_library.keys()
		var idx:=keys.find(str(properties.get("name","")))
		if idx>=0:
			_asset.select(idx)
			path=str(_library.get(keys[idx],""))
	elif slot=="ground":
		path="res://assets/textures/ground_"+biome+".png"
	else:
		path="res://assets/textures/cliff_"+biome+".png"
	_update_picture(path)
	var painted: Dictionary=store.data.get("handpaintMaterial",{})
	_art_opacity.set_value_no_signal(float(painted.get("opacity",0.50))*100.0)
	_art_contrast.set_value_no_signal(float(painted.get("contrast",0.45))*100.0)
	_art_rotation.set_value_no_signal(float(painted.get("rotation",180.0)))
	var ground_mix: Dictionary=store.data.get("groundMix",{})
	_ground_transparency.set_value_no_signal((1.0-clampf(float(ground_mix.get("opacity",1.0)),0.0,1.0))*100.0)
	_ground_feather.set_value_no_signal(clampf(float(ground_mix.get("feather",5.0)),0.0,20.0))
	_art_blend.select(clampi(int(ground_mix.get("mode",painted.get("blendMode",3))),0,7))
	_refreshing=false


func _update_picture(path: String) -> void:
	if path.is_empty() or not ResourceLoader.exists(path):
		_image.texture=null
		return
	_image.texture=load(path) as Texture2D


func _preview_changes(_value: float) -> void:
	if _refreshing or store==null or host==null:
		return
	var world:=host.call("_get_world") as Node3D
	if world==null or not world.has_method("apply_editor_material_preview"):
		return
	var preview: Dictionary=store.data.duplicate(true)
	_assign_values(preview)
	world.call("apply_editor_material_preview",preview)
	if _info!=null:
		_info.text="Vista previa sin aplicar."


func _assign_values(next: Dictionary) -> void:
	var biome:=_biome_id()
	var slot:=_slot_id()
	if slot=="cliff":
		var settings: Dictionary=next.get("cliffHeightSettings",{})
		var biomes: Dictionary=settings.get("biomes",{})
		var own: Dictionary=biomes.get(biome,{})
		own["repeats"]=_scale.value
		own["intensity"]=_opacity.value/100.0
		biomes[biome]=own
		settings["biomes"]=biomes
		next["cliffHeightSettings"]=settings
	else:
		var material: Dictionary=next.get("biomeMaterials",{}).get(biome,{})
		var slots: Dictionary=material.get("slots",{})
		var record: Dictionary=slots.get(slot,{})
		record["scale"]=_scale.value
		record["opacity"]=_opacity.value/100.0
		if slot.begins_with("detail"):
			var keys: Array=_library.keys()
			if _asset.selected>=0 and _asset.selected<keys.size():
				record["name"]=str(keys[_asset.selected])
				record["image"]="./assets/terrain/texturas/"+str(keys[_asset.selected]).uri_encode()
		slots[slot]=record
		material["slots"]=slots
		material["colorContrast"]=_contrast.value/100.0
		material["colorSaturation"]=_saturation.value/100.0
		var all: Dictionary=next.get("biomeMaterials",{})
		all[biome]=material
		next["biomeMaterials"]=all
	next["handpaintMaterial"]=_handpaint_values()
	next["groundMix"]=_ground_mix_values()


func _handpaint_values() -> Dictionary:
	return {"opacity":_art_opacity.value/100.0,
		"contrast":_art_contrast.value/100.0,
		"rotation":_art_rotation.value}


func _ground_mix_values() -> Dictionary:
	return {"opacity":1.0-_ground_transparency.value/100.0,"mode":_art_blend.selected,"feather":_ground_feather.value}


func _apply_ground_mix() -> void:
	if store==null:
		return
	if store.set_ground_mix(_ground_mix_values()):
		if host!=null:
			host.call("external_editor_changed","materials")
		_info.text="Mezcla del suelo sin guardar."
	else:
		_info.text=store.last_error


func _apply_material() -> void:
	if store==null:
		return
	var biome:=_biome_id()
	var slot:=_slot_id()
	var values: Dictionary={
		"scale":_scale.value,
		"opacity":_opacity.value/100.0,
		"colorContrast":_contrast.value/100.0,
		"colorSaturation":_saturation.value/100.0
	}
	if slot.begins_with("detail"):
		var keys: Array=_library.keys()
		if _asset.selected>=0 and _asset.selected<keys.size():
			values["name"]=keys[_asset.selected]
	if store.set_material_values(biome,slot,values):
		if host!=null:
			host.call("external_editor_changed","materials")
		_info.text="Material sin guardar."
	else:
		_info.text=store.last_error


func _apply_handpaint() -> void:
	if store==null:
		return
	if store.set_handpaint_values(_handpaint_values()):
		if host!=null:
			host.call("external_editor_changed","materials")
		_info.text="Pintura sin guardar."
	else:
		_info.text=store.last_error


func _toggle_visibility(enabled: bool,key: String) -> void:
	if host==null:
		return
	host.call("set_texture_layer_visible",key,enabled)


func summary() -> Dictionary:
	return {"biomes":_biome.item_count if _biome!=null else 0,
		"layers":_slot.item_count if _slot!=null else 0,
		"assets":_asset.item_count if _asset!=null else 0}
