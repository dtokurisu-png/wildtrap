extends SceneTree
## Editor integration: five real scrollable tabs, 15 palette entries, material
## controls outside Biomas, live object placement and shader parameter updates.
func _initialize() -> void:
	call_deferred("_check")


func _check() -> void:
	if not Engine.is_editor_hint():
		_fail("Must run with --editor --script")
		return
	var scene: Node=(load("res://scenes/main.tscn") as PackedScene).instantiate()
	root.add_child(scene)
	await process_frame
	await process_frame
	var dock: Control=load("res://addons/wildtrap_editor/dock.gd").new()
	root.add_child(dock)
	dock.call("on_scene_changed",scene)
	var tabs:=dock.find_child("WildTrapTabs",true,false) as TabContainer
	if tabs==null or tabs.get_tab_count()!=5:
		_fail("Expected five native editor tabs")
		return
	for i in range(5):
		var label_text:=["Biomas","Zonas","Spawns","Objetos","Texturas"][i]
		if tabs.get_tab_title(i)!=label_text:
			_fail("Wrong tab "+str(i)+": "+tabs.get_tab_title(i))
			return
		var panel:=dock.find_child(label_text,true,false) as ScrollContainer
		if panel==null or panel.vertical_scroll_mode!=ScrollContainer.SCROLL_MODE_SHOW_ALWAYS:
			_fail("Tab not scrollable: "+label_text)
			return
	var biome_tab:=dock.find_child("Biomas",true,false)
	if biome_tab.find_child("Material_details",true,false)!=null:
		_fail("Material controls still mixed into Biomas")
		return
	var object_panel:=dock.find_child("ObjectTools",true,false) as Control
	var texture_panel:=dock.find_child("TextureTools",true,false) as Control
	if object_panel==null or texture_panel==null:
		_fail("Missing Objetos or Texturas panels")
		return
	var object_info: Dictionary=object_panel.call("summary")
	var texture_info: Dictionary=texture_panel.call("summary")
	if int(object_info.get("catalog",0))!=15 or int(texture_info.get("assets",0))!=15:
		_fail("Original GLB or RGBA asset catalog incomplete: "+JSON.stringify(object_info)+" "+JSON.stringify(texture_info))
		return
	if int(texture_info.get("layers",0))!=5 or int(texture_info.get("biomes",0))!=5:
		_fail("Texture editor needs all five biomes and five slots")
		return
	if texture_panel.find_child("Material_handpaint",true,false)==null or texture_panel.find_child("HandpaintBlend",true,false)==null:
		_fail("Handpaint controls not moved to Texturas")
		return
	var store: RefCounted=dock.get("_store")
	var old_count: int=(store.data.get("nodes",[]) as Array).size()
	tabs.current_tab=3
	var objects: Array=load("res://addons/wildtrap_editor/object_rules.gd").catalog()
	var chosen: int=-1
	for i in range(objects.size()):
		if str(objects[i].get("id",""))=="mountain":
			chosen=i
			break
	if chosen<0:
		_fail("Mountain original GLB is missing")
		return
	object_panel.call("_on_palette_selected",chosen)
	object_panel.call("_set_mode","place")
	if not bool(object_panel.call("handle_terrain_hit",Vector3(91.0,3.0,63.0))):
		_fail("Native terrain placement did not handle click")
		return
	if (store.data.get("nodes",[]) as Array).size()!=old_count+1:
		_fail("Object was not placed in undoable world store")
		return
	var selected_id: int=int(object_panel.get("_selected_id"))
	var native_node:=scene.get_node_or_null("World/Prefab_mountain_"+str(selected_id))
	if native_node==null or native_node.owner!=null:
		_fail("New model not rendered in editor or became persistent scene node")
		return
	var change: Dictionary=store.object_edit(selected_id,"rotation",0.7)
	if not bool(change.get("changed",false)):
		_fail("Object rotation update failed")
		return
	if not store.undo() or not store.redo():
		_fail("Object undo or redo failed")
		return
	if not store.set_material_values("forest","detail1",{"scale":60,"opacity":0.42,"name":"Parche de suelo forestal erosionado.png","colorContrast":1.3,"colorSaturation":1.2}):
		_fail("Material editor could not apply native detail settings: "+store.last_error)
		return
	dock.call("external_editor_changed","materials")
	var detail_node:=scene.get_node_or_null("World/WildTrapDetail_forest_1") as MeshInstance3D
	var material:=detail_node.material_override as ShaderMaterial if detail_node!=null else null
	if material==null or absf(float(material.get_shader_parameter("repeats"))-60.0)>0.001:
		_fail("Material preview not updating real detail shader")
		return
	if not store.set_handpaint_values({"opacity":0.61,"rotation":75,"contrast":0.8,"blendMode":4}):
		_fail("Handpaint settings not editable")
		return
	dock.call("external_editor_changed","materials")
	var terrain:=scene.get_node("World/WildTrapTerrain") as MeshInstance3D
	var painter:=terrain.material_override as ShaderMaterial
	if painter==null or absf(float(painter.get_shader_parameter("handpaint_opacity"))-0.61)>0.001:
		_fail("Handpaint preview did not update")
		return
	if int(painter.get_shader_parameter("handpaint_blend_mode"))!=4:
		_fail("Handpaint blend mode is not applied to shader")
		return
	print("WILDTRAP_FIVE_TABS_OK palette=15 details=15 tabs=5 placement=true handpaint=true")
	dock.call("clear_spawn_preview")
	scene.queue_free()
	dock.queue_free()
	await process_frame
	quit(0)


func _fail(message: String) -> void:
	push_error("WILDTRAP_FIVE_TABS_FAILED: "+message)
	quit(1)
