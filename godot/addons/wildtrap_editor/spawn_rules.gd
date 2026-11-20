@tool
extends RefCounted
## Native equivalents of editor-spawn-areas.mjs and editor-player-spawns.mjs.
## Data definitions only: the game's runtime ecosystem generator is a later stage.

const POINT_CATEGORIES := ["player","npc","trees","grass","plants","rocks","objects","specialCreature"]
const AREA_CATEGORIES := ["trees","grass","plants","rocks","objects","npc","specialCreature","river","swamp","lake","oasis","dune","mountain","cliff"]
const BIOME_IDS := ["any","forest","plains","desert","swamp","mountain"]
const MAX_PLAYERS := 6


static func is_spawn_node(item: Dictionary) -> bool:
	return str(item.get("kind","")) in ["playerSpawn","characterSpawn","spawnPoint"]


static func point_category(node: Dictionary) -> String:
	match str(node.get("kind","")):
		"playerSpawn":
			return "player"
		"characterSpawn":
			return "npc"
		"spawnPoint":
			return str(node.get("category","objects"))
	return ""


static func _within(world: Dictionary, x: float, z: float) -> bool:
	var half := float(world.get("size",630))/2.0
	return is_finite(x) and is_finite(z) and absf(x)<=half and absf(z)<=half


static func _next_id(world: Dictionary) -> int:
	var taken: Dictionary = {}
	for node in world.get("nodes",[]):
		if node is Dictionary and node.get("id") is int:
			taken[int(node.get("id"))]=true
	for area in world.get("spawnAreas",[]):
		if area is Dictionary:
			var id_text := str(area.get("id",""))
			if id_text.begins_with("spawn-area-") and id_text.trim_prefix("spawn-area-").is_valid_int():
				taken[int(id_text.trim_prefix("spawn-area-"))]=true
	var id_num := maxi(1,int(world.get("nextId",1)))
	while taken.has(id_num):
		id_num+=1
	world["nextId"]=id_num+1
	return id_num


static func place_point(world: Dictionary, category: String, x: float, z: float, player_slot: int = 1) -> Dictionary:
	if not POINT_CATEGORIES.has(category) or not _within(world,x,z):
		return {"ok":false,"error":"Categoría o posición fuera del escenario."}
	var nodes: Array = world.get("nodes",[])
	if category=="player":
		if player_slot<1 or player_slot>MAX_PLAYERS:
			return {"ok":false,"error":"Selecciona un jugador entre 1 y 6."}
		for node in nodes:
			if node is Dictionary and str(node.get("kind",""))=="playerSpawn" and int(node.get("playerSlot",0))==player_slot:
				if is_equal_approx(float(node.get("x",0)),x) and is_equal_approx(float(node.get("z",0)),z):
					return {"ok":true,"changed":false,"id":int(node.get("id",-1))}
				node["x"]=x
				node["z"]=z
				return {"ok":true,"changed":true,"id":int(node.get("id",-1))}
	var id_num := _next_id(world)
	var record: Dictionary = {"id":id_num,"x":x,"z":z}
	if category=="player":
		record["kind"]="playerSpawn"
		record["playerSlot"]=player_slot
	elif category=="npc":
		record["kind"]="characterSpawn"
		record["npcId"]=""
	else:
		record["kind"]="spawnPoint"
		record["category"]=category
	nodes.append(record)
	world["nodes"]=nodes
	return {"ok":true,"changed":true,"id":id_num}


static func _find_point(world: Dictionary, id_num: int) -> Dictionary:
	for node in world.get("nodes",[]):
		if node is Dictionary and is_spawn_node(node) and int(node.get("id",-1))==id_num:
			return node
	return {}


static func move_point(world: Dictionary, id_num: int, x: float, z: float) -> Dictionary:
	if not _within(world,x,z):
		return {"ok":false,"error":"Punto fuera de los límites del mapa."}
	var record := _find_point(world,id_num)
	if record.is_empty():
		return {"ok":false,"error":"Spawn no encontrado."}
	if is_equal_approx(float(record.get("x",0)),x) and is_equal_approx(float(record.get("z",0)),z):
		return {"ok":true,"changed":false,"id":id_num}
	record["x"]=x
	record["z"]=z
	return {"ok":true,"changed":true,"id":id_num}


static func delete_point(world: Dictionary, id_num: int) -> Dictionary:
	var nodes: Array = world.get("nodes",[])
	for i in range(nodes.size()):
		if nodes[i] is Dictionary and is_spawn_node(nodes[i]) and int(nodes[i].get("id",-1))==id_num:
			nodes.remove_at(i)
			return {"ok":true,"changed":true}
	return {"ok":false,"error":"Spawn no encontrado."}


static func _orient(a: Dictionary,b: Dictionary,c: Dictionary) -> float:
	return (float(b.get("x",0))-float(a.get("x",0)))*(float(c.get("z",0))-float(a.get("z",0)))-(float(b.get("z",0))-float(a.get("z",0)))*(float(c.get("x",0))-float(a.get("x",0)))


static func _between(a: Dictionary,b: Dictionary,c: Dictionary) -> bool:
	var x := float(c.get("x",0))
	var z := float(c.get("z",0))
	return x>=minf(float(a.get("x",0)),float(b.get("x",0)))-0.000001 and x<=maxf(float(a.get("x",0)),float(b.get("x",0)))+0.000001 and z>=minf(float(a.get("z",0)),float(b.get("z",0)))-0.000001 and z<=maxf(float(a.get("z",0)),float(b.get("z",0)))+0.000001


static func _segments_cross(a: Dictionary,b: Dictionary,c: Dictionary,d: Dictionary) -> bool:
	var x := _orient(a,b,c)
	var y := _orient(a,b,d)
	var z := _orient(c,d,a)
	var w := _orient(c,d,b)
	if (x*y<0.0 and z*w<0.0):
		return true
	return (absf(x)<0.000001 and _between(a,b,c)) or (absf(y)<0.000001 and _between(a,b,d)) or (absf(z)<0.000001 and _between(c,d,a)) or (absf(w)<0.000001 and _between(c,d,b))


static func valid_polygon(world: Dictionary, points: Array) -> bool:
	if points.size()<3 or points.size()>128:
		return false
	var signed_area := 0.0
	for i in range(points.size()):
		if not (points[i] is Dictionary):
			return false
		var a: Dictionary = points[i]
		var b: Dictionary = points[(i+1)%points.size()]
		var ax := float(a.get("x",INF))
		var az := float(a.get("z",INF))
		var bx := float(b.get("x",INF))
		var bz := float(b.get("z",INF))
		if not _within(world,ax,az) or not _within(world,bx,bz) or Vector2(ax-bx,az-bz).length()<0.3:
			return false
		signed_area+=ax*bz-bx*az
	if absf(signed_area)<2.0:
		return false
	for i in range(points.size()):
		for j in range(i+1,points.size()):
			if j==i+1 or (i==0 and j==points.size()-1):
				continue
			if _segments_cross(points[i],points[(i+1)%points.size()],points[j],points[(j+1)%points.size()]):
				return false
	return true


static func contains(poly: Array,x: float,z: float) -> bool:
	if poly.size()<3:
		return false
	var inside := false
	var j := poly.size()-1
	for i in range(poly.size()):
		var a: Dictionary = poly[i]
		var b: Dictionary = poly[j]
		var az := float(a.get("z",0))
		var bz := float(b.get("z",0))
		if (az>z)!=(bz>z):
			if x<(float(b.get("x",0))-float(a.get("x",0)))*(z-az)/(bz-az)+float(a.get("x",0)):
				inside=not inside
		j=i
	return inside


static func create_area(world: Dictionary, points: Array, area_type: String = "trees", biome: String = "any", density: int = 40, area_name: String = "") -> Dictionary:
	if not valid_polygon(world,points):
		return {"ok":false,"error":"Se necesitan 3+ puntos sin cruces ni bordes diminutos."}
	if not AREA_CATEGORIES.has(area_type) or not BIOME_IDS.has(biome) or density<0 or density>100:
		return {"ok":false,"error":"Categoría, bioma o densidad inválidos."}
	var id_num := _next_id(world)
	var area_id := "spawn-area-"+str(id_num)
	var entry := {
		"id":area_id,
		"name":area_name.strip_edges().substr(0,80) if not area_name.strip_edges().is_empty() else "Área "+str((world.get("spawnAreas",[]) as Array).size()+1),
		"type":area_type,
		"biome":biome,
		"density":density,
		"hidden":false,
		"points":points.duplicate(true),
	}
	var areas: Array = world.get("spawnAreas",[])
	areas.append(entry)
	world["spawnAreas"]=areas
	return {"ok":true,"changed":true,"id":area_id}


static func _find_area(world: Dictionary, id_text: String) -> Dictionary:
	for area in world.get("spawnAreas",[]):
		if area is Dictionary and str(area.get("id",""))==id_text:
			return area
	return {}


static func change_area(world: Dictionary, id_text: String, field: String, value: Variant) -> Dictionary:
	if not ["name","type","biome","density","hidden"].has(field):
		return {"ok":false,"error":"Propiedad de área desconocida."}
	var area := _find_area(world,id_text)
	if area.is_empty():
		return {"ok":false,"error":"Área no encontrada."}
	var replacement: Variant = value
	match field:
		"name":
			replacement=str(value).strip_edges().substr(0,80)
			if replacement.is_empty():
				return {"ok":false,"error":"El área necesita un nombre."}
		"type":
			if not AREA_CATEGORIES.has(str(value)):
				return {"ok":false,"error":"Tipo de área inválido."}
			replacement=str(value)
		"biome":
			if not BIOME_IDS.has(str(value)):
				return {"ok":false,"error":"Bioma inválido."}
			replacement=str(value)
		"density":
			var number := int(value)
			if number<0 or number>100:
				return {"ok":false,"error":"Densidad fuera de 0–100."}
			replacement=number
		"hidden":
			replacement=bool(value)
	if area.get(field)==replacement:
		return {"ok":true,"changed":false,"id":id_text}
	area[field]=replacement
	return {"ok":true,"changed":true,"id":id_text}


static func move_area_vertex(world: Dictionary, id_text: String, index: int, x: float, z: float) -> Dictionary:
	var area := _find_area(world,id_text)
	if area.is_empty():
		return {"ok":false,"error":"Área no encontrada."}
	var points: Array = area.get("points",[])
	if index<0 or index>=points.size() or not _within(world,x,z):
		return {"ok":false,"error":"Vértice o posición inválidos."}
	var edited: Array = points.duplicate(true)
	if is_equal_approx(float(edited[index].get("x",0)),x) and is_equal_approx(float(edited[index].get("z",0)),z):
		return {"ok":true,"changed":false}
	edited[index]={"x":x,"z":z}
	if not valid_polygon(world,edited):
		return {"ok":false,"error":"El movimiento cruza los bordes o invalida el polígono."}
	area["points"]=edited
	return {"ok":true,"changed":true,"id":id_text}


static func delete_area(world: Dictionary, id_text: String) -> Dictionary:
	var areas: Array = world.get("spawnAreas",[])
	for i in range(areas.size()):
		if areas[i] is Dictionary and str(areas[i].get("id",""))==id_text:
			areas.remove_at(i)
			return {"ok":true,"changed":true}
	return {"ok":false,"error":"Área no encontrada."}


static func validate_world(world: Dictionary) -> bool:
	var slots: Dictionary = {}
	var ids: Dictionary = {}
	for node in world.get("nodes",[]):
		if not (node is Dictionary):
			return false
		if not is_spawn_node(node):
			continue
		var id_num := int(node.get("id",-1))
		if id_num<1 or ids.has(id_num) or not _within(world,float(node.get("x",INF)),float(node.get("z",INF))):
			return false
		ids[id_num]=true
		var category := point_category(node)
		if not POINT_CATEGORIES.has(category):
			return false
		if category=="player":
			var slot := int(node.get("playerSlot",0))
			if slot<1 or slot>MAX_PLAYERS or slots.has(slot):
				return false
			slots[slot]=true
	var area_ids: Dictionary = {}
	for area in world.get("spawnAreas",[]):
		if not (area is Dictionary):
			return false
		var aid := str(area.get("id",""))
		if aid.is_empty() or area_ids.has(aid):
			return false
		area_ids[aid]=true
		if not valid_polygon(world,area.get("points",[])):
			return false
		if not AREA_CATEGORIES.has(str(area.get("type","trees"))) or not BIOME_IDS.has(str(area.get("biome","any"))):
			return false
		var density := int(area.get("density",40))
		if density<0 or density>100:
			return false
	return true
