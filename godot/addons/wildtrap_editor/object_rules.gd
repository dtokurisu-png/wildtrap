@tool
extends RefCounted
## Safe object editing compatible with the original prefab-catalog.mjs records.
const CATALOG_PATH := "res://data/object-catalog.json"

static func catalog() -> Array:
	var parsed: Variant=JSON.parse_string(FileAccess.get_file_as_string(CATALOG_PATH))
	return parsed if parsed is Array else []


static func by_id(identifier: String) -> Dictionary:
	for item in catalog():
		if item is Dictionary and str(item.get("id",""))==identifier:
			return item
	return {}


static func find_node(world: Dictionary, id_num: int) -> Dictionary:
	for entry in world.get("nodes",[]):
		if entry is Dictionary and str(entry.get("kind",""))=="prefab" and int(entry.get("id",-1))==id_num:
			return entry
	return {}


static func _inside(world: Dictionary,x: float,z: float) -> bool:
	var half := float(world.get("size",630))/2.0
	return is_finite(x) and is_finite(z) and absf(x)<=half and absf(z)<=half


static func _next_id(world: Dictionary) -> int:
	var used: Dictionary={}
	for entry in world.get("nodes",[]):
		if entry is Dictionary:
			used[int(entry.get("id",-1))]=true
	var number := maxi(1,int(world.get("nextId",1)))
	while used.has(number):
		number+=1
	world["nextId"]=number+1
	return number


static func place(world: Dictionary,prefab: String,x: float,z: float) -> Dictionary:
	if by_id(prefab).is_empty() or not _inside(world,x,z):
		return {"ok":false,"error":"Modelo o coordenadas inválidas."}
	var id_num:=_next_id(world)
	var entry: Dictionary={
		"id":id_num,"kind":"prefab","prefabId":prefab,
		"x":x,"z":z,"rotation":0.0,"rotationX":0.0,"rotationZ":0.0,
		"scale":1.0,"offsetY":0.0,"editorHidden":false,"editorIntangible":false
	}
	var nodes: Array=world.get("nodes",[])
	nodes.append(entry)
	world["nodes"]=nodes
	return {"ok":true,"changed":true,"id":id_num}


static func edit(world: Dictionary,id_num: int,field: String,value: Variant) -> Dictionary:
	var node:=find_node(world,id_num)
	if node.is_empty():
		return {"ok":false,"error":"Objeto no encontrado."}
	if not ["x","z","y","rotation","rotationX","rotationZ","scale","editorHidden","editorIntangible"].has(field):
		return {"ok":false,"error":"Propiedad no editable."}
	var converted: Variant=value
	if field=="editorHidden" or field=="editorIntangible":
		converted=bool(value)
	else:
		var num:=float(value)
		if not is_finite(num):
			return {"ok":false,"error":"Valor numérico inválido."}
		match field:
			"x","z":
				if not _inside(world,num,float(node.get("z",0))) and field=="x" or not _inside(world,float(node.get("x",0)),num) and field=="z":
					return {"ok":false,"error":"Objeto fuera del mapa."}
			"y":
				if not bool(by_id(str(node.get("prefabId",""))).get("freeCave",false)) or absf(num)>2000.0:
					return {"ok":false,"error":"Altura libre solo para cuevas."}
			"scale":
				if num<0.01 or num>30.0:
					return {"ok":false,"error":"Escala permitida: 0.01–30."}
			_:
				if absf(num)>10000.0:
					return {"ok":false,"error":"Rotación fuera de límites."}
		converted=num
	if node.has(field) and node[field]==converted:
		return {"ok":true,"changed":false,"id":id_num}
	node[field]=converted
	return {"ok":true,"changed":true,"id":id_num}


static func erase(world: Dictionary,id_num: int) -> Dictionary:
	var nodes: Array=world.get("nodes",[])
	for i in range(nodes.size()):
		if nodes[i] is Dictionary and str(nodes[i].get("kind",""))=="prefab" and int(nodes[i].get("id",-1))==id_num:
			nodes.remove_at(i)
			return {"ok":true,"changed":true}
	return {"ok":false,"error":"Objeto no encontrado."}


static func validate_world(world: Dictionary) -> bool:
	var ids: Dictionary={}
	for entry in world.get("nodes",[]):
		if not (entry is Dictionary):
			return false
		var id_num:=int(entry.get("id",-1))
		if id_num<0 or ids.has(id_num):
			return false
		ids[id_num]=true
		if str(entry.get("kind",""))!="prefab":
			continue
		if by_id(str(entry.get("prefabId",""))).is_empty() or not _inside(world,float(entry.get("x",INF)),float(entry.get("z",INF))):
			return false
		var factor:=float(entry.get("scale",1.0))
		if not is_finite(factor) or factor<0.01 or factor>30.0:
			return false
	return true
