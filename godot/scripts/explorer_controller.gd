extends CharacterBody3D
## Explorador 1 WT: native port of playtest.mjs movement and chase camera.
## Player/collisions exist ONLY while Play is running, never in edit mode.
const MODEL := "res://assets/models/explorador_1_wt.glb"
const PLAY_SPAWN = preload("res://scripts/play_spawn_preview.gd")
const CAMERA_DISTANCE := 2.55
const CAMERA_HEIGHT := 1.15
const CAMERA_ELEVATION := 1.90
const CAMERA_LOOK_AHEAD := 1.35
const CAMERA_SHOULDER := 0.28
const SPEED_WALK := 1.90
const SPEED_RUN := 3.00
const GRAVITY := 19.6

var camera: Camera3D
var world: Node3D
var visual_root: Node3D
var animation_player: AnimationPlayer
var idle_name := ""
var run_name := ""
var is_running := false
var is_dragging := false
var yaw := 0.0
var pitch := 0.22
var _focus: Vector3 = Vector3.ZERO
var _last_move := Vector3.ZERO
var imported_animations := 0
var model_mesh_count := 0
var initial_spawn := Vector3.ZERO


func initialize(game_camera: Camera3D, game_world: Node3D) -> void:
	camera=game_camera
	world=game_world


func _ready() -> void:
	name="Explorador1WT"
	collision_layer=2
	collision_mask=1
	floor_snap_length=0.32
	floor_max_angle=acos(0.58)
	safe_margin=0.02
	var capsule:=CapsuleShape3D.new()
	capsule.radius=0.21
	capsule.height=0.875
	var shape:=CollisionShape3D.new()
	shape.name="WT_Capsule"
	shape.shape=capsule
	shape.position.y=0.4375
	add_child(shape)
	_load_character()
	_spawn_at_player_one()
	_reset_camera()
	print("WILDTRAP_PLAY_READY model_meshes=",model_mesh_count,
		" animations=",imported_animations," idle=",idle_name," run=",run_name,
		" spawn=",initial_spawn)


func _load_character() -> void:
	var packed:=load(MODEL) as PackedScene
	if packed==null:
		push_error("Falta el modelo original Explorador 1 WT")
		return
	visual_root=Node3D.new()
	visual_root.name="ExplorerVisual"
	add_child(visual_root)
	var character:=packed.instantiate() as Node3D
	if character==null:
		push_error("No se pudo instanciar Explorador 1 WT")
		return
	visual_root.add_child(character)
	character.name="ExplorerRig"
	# Original WT avatar: 0.90 world units tall, corrected facing +Z -> -Z.
	# Scale the imported rig, not the controller or capsule collider.
	var lower:=Vector3(INF,INF,INF)
	var upper:=Vector3(-INF,-INF,-INF)
	for part in character.find_children("*","MeshInstance3D",true,false):
		var model:=part as MeshInstance3D
		if model.mesh==null:
			continue
		model_mesh_count+=1
		model.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_ON
		var raw_box:=model.get_aabb()
		var local_xform:=character.global_transform.affine_inverse()*model.global_transform
		for ix in range(2):
			for iy in range(2):
				for iz in range(2):
					var point:=raw_box.position+Vector3(
						raw_box.size.x*float(ix),raw_box.size.y*float(iy),raw_box.size.z*float(iz))
					point=local_xform*point
					lower=lower.min(point)
					upper=upper.max(point)
	if model_mesh_count==0:
		push_error("El GLB del Explorador no contiene mallas.")
		return
	if not is_finite(lower.y) or upper.y-lower.y<0.00001:
		push_warning("El rig del Explorador tiene altura no calculable; usando escala original.")
	else:
		var avatar_scale:=clampf(0.90/(upper.y-lower.y),0.00001,10000.0)
		character.scale=Vector3.ONE*avatar_scale
		character.position=-Vector3((lower.x+upper.x)*0.5,lower.y,(lower.z+upper.z)*0.5)*avatar_scale
	visual_root.rotation.y=PI
	_find_animations(character)


func _find_animations(character: Node3D) -> void:
	var players:=character.find_children("*","AnimationPlayer",true,false)
	if players.is_empty():
		push_warning("Explorador 1 WT: no se importaron AnimationPlayer; modelo estático.")
		return
	animation_player=players[0] as AnimationPlayer
	var all: Array[String]=[]
	for clip in animation_player.get_animation_list():
		if str(clip)!="RESET":
			all.append(str(clip))
	imported_animations=all.size()
	if all.is_empty():
		return
	# The browser identified clip 3 = Idle and clip 5 = Running.
	# Keep imported order and never confuse the engine RESET clip.
	idle_name=all[mini(2,all.size()-1)]
	run_name=all[mini(4,all.size()-1)]
	var idle_source:=animation_player.get_animation(idle_name)
	var run_source:=animation_player.get_animation(run_name)
	var library:=AnimationLibrary.new()
	# Imported GLB clips are one-shot by default. Make independent runtime
	# copies so both Idle and Running loop without changing source assets.
	if idle_source!=null:
		var idle_loop:=idle_source.duplicate(true) as Animation
		idle_loop.loop_mode=Animation.LOOP_LINEAR
		if library.add_animation("Idle_Loop",idle_loop)==OK:
			idle_name="WildTrap/Idle_Loop"
	if run_source!=null:
		var adjusted:=run_source.duplicate(true) as Animation
		adjusted.loop_mode=Animation.LOOP_LINEAR
		# Equivalent to playtest-animation.mjs, keeping vertical bobbing.
		for track in range(adjusted.get_track_count()):
			if adjusted.track_get_type(track)!=Animation.TYPE_POSITION_3D:
				continue
			var path_text:=str(adjusted.track_get_path(track)).to_lower()
			if not (path_text.contains("hips") or path_text.contains("pelvis") or path_text.contains("root") or path_text.contains("armature")):
				continue
			if adjusted.track_get_key_count(track)<1:
				continue
			var first: Variant=adjusted.track_get_key_value(track,0)
			if not (first is Vector3):
				continue
			for key in range(adjusted.track_get_key_count(track)):
				var value: Variant=adjusted.track_get_key_value(track,key)
				if value is Vector3:
					adjusted.track_set_key_value(track,key,Vector3(first.x,value.y,first.z))
		if library.add_animation("Run_InPlace",adjusted)==OK:
			run_name="WildTrap/Run_InPlace"
	if not library.get_animation_list().is_empty():
		animation_player.add_animation_library("WildTrap",library)
	animation_player.play(idle_name)


func _spawn_at_player_one() -> void:
	# Play uses the marker position exported by EditorPlugin._build() at F5.
	# It falls back to canonical world.json for normal standalone launches.
	var latest: Variant=JSON.parse_string(FileAccess.get_file_as_string("res://data/world.json"))
	var source: Dictionary=latest if latest is Dictionary else {}
	var found: Dictionary=PLAY_SPAWN.resolve(source)
	if found.is_empty():
		push_error("WildTrap: no hay un punto asignado a Jugador 1 (J1).")
		return
	var px:=float(found.get("x",0))
	var pz:=float(found.get("z",0))
	var surface:=0.0
	if world!=null and world.has_method("_height_at"):
		surface=float(world.call("_height_at",px,pz))
	var ground:=_find_floor(px,pz,surface)
	position=Vector3(px,ground,pz)
	initial_spawn=position
	print("WILDTRAP_PLAY_J1 source=",found.get("source","world.json")," x=",px," z=",pz)


func _find_floor(x: float,z: float,expected: float) -> float:
	if get_world_3d()==null:
		return expected
	var state:=get_world_3d().direct_space_state
	var start:=Vector3(x,expected+3.0,z)
	var end:=Vector3(x,expected-35.0,z)
	var query:=PhysicsRayQueryParameters3D.create(start,end,1)
	query.collide_with_bodies=true
	var hit:=state.intersect_ray(query)
	if not hit.is_empty():
		return float((hit["position"] as Vector3).y)
	return expected


func _reset_camera() -> void:
	if camera==null:
		return
	camera.current=true
	camera.fov=68.0
	camera.near=0.12
	camera.far=1400.0
	var forward:=Vector3(sin(yaw),0,-cos(yaw))
	var right:=Vector3(cos(yaw),0,sin(yaw))
	var desired:=position-forward*CAMERA_DISTANCE+right*CAMERA_SHOULDER
	desired.y+=CAMERA_ELEVATION+pitch*0.65
	_focus=position+forward*CAMERA_LOOK_AHEAD+Vector3.UP*(CAMERA_HEIGHT-pitch*0.55)
	camera.global_position=desired
	camera.look_at(_focus,Vector3.UP)


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		if event.button_index in [MOUSE_BUTTON_LEFT,MOUSE_BUTTON_RIGHT]:
			is_dragging=event.pressed
	elif event is InputEventMouseMotion and is_dragging:
		yaw-=event.relative.x*0.0032
		pitch=clampf(pitch+event.relative.y*0.0025,-0.18,0.95)
		get_viewport().set_input_as_handled()


func _movement_axes(forward: float,right: float,angle: float) -> Vector3:
	var input_vector:=Vector2(right,forward)
	if input_vector.length_squared()>1.0:
		input_vector=input_vector.normalized()
	var sx:=sin(angle)
	var cx:=cos(angle)
	return Vector3(input_vector.y*sx+input_vector.x*cx,0,
		-input_vector.y*cx+input_vector.x*sx)


func _physics_process(dt: float) -> void:
	var front:=float(Input.is_physical_key_pressed(KEY_W) or Input.is_physical_key_pressed(KEY_UP))-float(Input.is_physical_key_pressed(KEY_S) or Input.is_physical_key_pressed(KEY_DOWN))
	var side:=float(Input.is_physical_key_pressed(KEY_D) or Input.is_physical_key_pressed(KEY_RIGHT))-float(Input.is_physical_key_pressed(KEY_A) or Input.is_physical_key_pressed(KEY_LEFT))
	var move_vector:=_movement_axes(front,side,yaw)
	var speed:=SPEED_RUN if Input.is_physical_key_pressed(KEY_SHIFT) else SPEED_WALK
	velocity.x=move_vector.x*speed
	velocity.z=move_vector.z*speed
	if is_on_floor():
		velocity.y=minf(velocity.y,0.0)
	else:
		velocity.y=maxf(-24.0,velocity.y-GRAVITY*dt)
	move_and_slide()
	position.x=clampf(position.x,-312.0,312.0)
	position.z=clampf(position.z,-312.0,312.0)
	var travelling:=move_vector.length_squared()>0.001 and Vector2(velocity.x,velocity.z).length_squared()>0.0001
	if travelling:
		# The actual GLB faces +Z; parent heading is negative, child +PI.
		rotation.y=-atan2(move_vector.x,-move_vector.z)
	_update_animation(travelling)


func _update_animation(moving: bool) -> void:
	if animation_player==null:
		return
	if is_running==moving:
		return
	is_running=moving
	var animation_name:=run_name if moving else idle_name
	if not animation_name.is_empty() and animation_player.has_animation(animation_name):
		animation_player.play(animation_name,0.16)


func _process(dt: float) -> void:
	if camera==null:
		return
	var forward:=Vector3(sin(yaw),0,-cos(yaw))
	var right:=Vector3(cos(yaw),0,sin(yaw))
	var desired:=global_position-forward*CAMERA_DISTANCE+right*CAMERA_SHOULDER
	desired.y+=CAMERA_ELEVATION+pitch*0.65
	# Legacy playtest probes floor under camera, rather than shortening
	# the third-person chase orbit at every terrain intersection.
	var camera_floor:=_find_floor(desired.x,desired.z,global_position.y)
	if absf(camera_floor-global_position.y)<2.5:
		desired.y=maxf(desired.y,camera_floor+1.5)
	var look:=global_position+forward*CAMERA_LOOK_AHEAD+Vector3.UP*(CAMERA_HEIGHT-pitch*0.55)
	camera.global_position=camera.global_position.lerp(desired,1.0-exp(-dt*10.0))
	_focus=_focus.lerp(look,1.0-exp(-dt*14.0))
	camera.look_at(_focus,Vector3.UP)


func debug_summary() -> Dictionary:
	return {"meshes":model_mesh_count,"animation_count":imported_animations,
		"idle":idle_name,"run":run_name,"spawn":initial_spawn,
		"camera_distance":CAMERA_DISTANCE,"camera_height":CAMERA_ELEVATION,
		"walk_speed":SPEED_WALK,"run_speed":SPEED_RUN,"avatar_scale":0.90}
