extends SceneTree
## Check non-text object palette, transient drag, separated painting UI,
## and live feather/mix properties on a real imported native scene.
func _initialize() -> void:
	call_deferred("_test")


func _test() -> void:
	if not Engine.is_editor_hint():
		_fail("This test must run with --editor")
		return
	var scene: Node=(load("res://scenes/main.tscn") as PackedScene).instantiate()
	root.add_child(scene)
	await process_frame
	await process_frame
	var panel: Control=load("res://addons/wildtrap_editor/dock.gd").new()
	root.add_child(panel)
	panel.call("on_scene_changed",scene)
	var objects:=panel.find_child("ObjectTools",true,false) as Control
	var materials:=panel.find_child("TextureTools",true,false) as Control
	if objects==null or materials==null:
		_fail("Required editor tabs are missing")
		return
	if objects.find_child("SceneObjects",true,false)!=null:
		_fail("Old cave dropdown is still visible")
		return
	var gallery:=objects.find_child("ObjectPalette",true,false) as GridContainer
	if gallery==null or gallery.get_child_count()!=15:
		_fail("Expected 15 real object thumbnail cells")
		return
	var art:=materials.find_child("HandpaintImage",true,false) as TextureRect
	var ground:=materials.find_child("GroundMix",true,false)
	var feather:=materials.find_child("HandpaintBlend",true,false) as OptionButton
	if art==null or art.texture==null or art.texture.get_width()<1000:
		_fail("Original handpainting image is not visible in own section")
		return
	if ground==null or feather==null:
		_fail("Independent ground blend controls are missing")
		return
	var store: RefCounted=panel.get("_store")
	var starting: int=(store.data.get("nodes",[]) as Array).size()
	var press:=InputEventMouseButton.new()
	press.button_index=MOUSE_BUTTON_LEFT
	press.pressed=true
	objects.call("_tile_input",press,"rock-pillar-4")
	var world:=scene.get_node_or_null("World")
	var ghost:=world.get_node_or_null("__WT_ObjectDragGhost")
	if ghost==null or ghost.owner!=null:
		_fail("Dragging thumbnail must use an ephemeral 3D model")
		return
	if (store.data.get("nodes",[]) as Array).size()!=starting:
		_fail("Mouse down committed an object before drop")
		return
	if not objects.call("handle_terrain_hit",Vector3(25,0,25)):
		_fail("Drop did not save native prefab placement")
		return
	if (store.data.get("nodes",[]) as Array).size()!=starting+1:
		_fail("Placed prefab not in editable world store")
		return
	objects.call("deactivate")
	if world.get_node_or_null("__WT_ObjectDragGhost")!=null:
		_fail("Ghost was not removed after placement")
		return
	if not store.set_ground_mix({"opacity":0.75,"mode":1,"feather":7.5}):
		_fail("Cannot persist universal ground blending")
		return
	panel.call("external_editor_changed","materials")
	var terrain:=world.get_node_or_null("WildTrapTerrain") as MeshInstance3D
	var mat:=terrain.material_override as ShaderMaterial
	if mat==null:
		_fail("Native terrain material is missing")
		return
	if int(mat.get_shader_parameter("ground_blend_mode"))!=1 or absf(float(mat.get_shader_parameter("ground_transparency"))-0.75)>0.0001:
		_fail("Ground blend not applied to native shader")
		return
	if absf(float(mat.get_shader_parameter("region_feather_world"))-7.5)>0.0001:
		_fail("Biome edge feather width not updated")
		return
	var layer:=world.get_node_or_null("WildTrapDetail_forest_1") as MeshInstance3D
	if layer==null or layer.material_override==null or absf(float((layer.material_override as ShaderMaterial).get_shader_parameter("region_feather_world"))-7.5)>0.0001:
		_fail("Complementary detail boundaries not feathered")
		return
	print("WILDTRAP_OBJECT_DRAG_MATERIAL_OK gallery=15 source_image=true ground_mix=true smooth_edges=true")
	panel.queue_free()
	scene.queue_free()
	await process_frame
	quit(0)


func _fail(msg: String) -> void:
	push_error("WILDTRAP_OBJECT_DRAG_MATERIAL_FAILED: "+msg)
	quit(1)
