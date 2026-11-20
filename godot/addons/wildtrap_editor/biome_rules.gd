@tool
extends RefCounted
## Port of the original five-region enumerator in biome-generator.mjs.
## The original JS is not loaded in a released Godot game.
const IDS := ["mountain", "desert", "plains", "swamp", "forest"]

static func regions(source: Dictionary) -> Array:
	var found: Array = []
	for entry in source.get("zones", []):
		if entry is Dictionary and not bool(entry.get("isCliff", false)):
			found.append(entry)
	return found


static func _is_east(zone: Dictionary) -> bool:
	# Match "zona este", not "noreste", just as the original generator.
	var name_text := str(zone.get("name", "")).to_lower().replace("é", "e")
	for word in name_text.replace("-", " ").replace("_", " ").split(" ", false):
		if word == "este":
			return true
	return false


static func _inside(poly: Array, px: float, pz: float) -> bool:
	var hit := false
	var j := poly.size() - 1
	for i in range(poly.size()):
		var a: Dictionary = poly[i]
		var b: Dictionary = poly[j]
		var az := float(a.get("z", 0)), bz := float(b.get("z", 0))
		if (az > pz) != (bz > pz):
			var crossing := (float(b.get("x", 0))-float(a.get("x", 0)))*(pz-az)/(bz-az)+float(a.get("x", 0))
			if px < crossing:
				hit = not hit
		j = i
	return hit


static func _point_segment(px: float, pz: float, a: Dictionary, b: Dictionary) -> float:
	var ax := float(a.get("x", 0)), az := float(a.get("z", 0))
	var dx := float(b.get("x", 0))-ax, dz := float(b.get("z", 0))-az
	var length2 := dx*dx+dz*dz
	var t := clampf(((px-ax)*dx+(pz-az)*dz)/length2,0.0,1.0) if length2>0.0 else 0.0
	return Vector2(px-ax-dx*t, pz-az-dz*t).length()


static func _segment_distance(a: Dictionary, b: Dictionary, c: Dictionary, d: Dictionary) -> float:
	var ab := Vector2(float(b.get("x", 0))-float(a.get("x", 0)), float(b.get("z", 0))-float(a.get("z", 0)))
	var cd := Vector2(float(d.get("x", 0))-float(c.get("x", 0)), float(d.get("z", 0))-float(c.get("z", 0)))
	var ac := Vector2(float(c.get("x", 0))-float(a.get("x", 0)), float(c.get("z", 0))-float(a.get("z", 0)))
	var denom := ab.cross(cd)
	if absf(denom) > 0.000000001:
		var t := ac.cross(cd)/denom
		var u := ac.cross(ab)/denom
		if t>=0.0 and t<=1.0 and u>=0.0 and u<=1.0:
			return 0.0
	return minf(minf(
		_point_segment(float(a.get("x",0)),float(a.get("z",0)),c,d),
		_point_segment(float(b.get("x",0)),float(b.get("z",0)),c,d)),
		minf(
		_point_segment(float(c.get("x",0)),float(c.get("z",0)),a,b),
		_point_segment(float(d.get("x",0)),float(d.get("z",0)),a,b)))


static func _bounds(poly: Array) -> Rect2:
	var mn := Vector2(INF, INF)
	var mx := Vector2(-INF, -INF)
	for p in poly:
		var point := Vector2(float(p.get("x",0)),float(p.get("z",0)))
		mn = mn.min(point)
		mx = mx.max(point)
	return Rect2(mn, mx-mn)


static func _adjacency(zones: Array) -> Array:
	var neighbors: Array = []
	for z in zones:
		neighbors.append([])
	for i in range(zones.size()):
		var a: Array = zones[i].get("points", [])
		if a.size() < 3:
			continue
		var box_a := _bounds(a)
		for j in range(i+1,zones.size()):
			var b: Array = zones[j].get("points", [])
			if b.size() < 3:
				continue
			var box_b := _bounds(b)
			if box_a.end.x+1.25 < box_b.position.x or box_b.end.x+1.25 < box_a.position.x or box_a.end.y+1.25 < box_b.position.y or box_b.end.y+1.25 < box_a.position.y:
				continue
			var touching := false
			for p in a:
				if _inside(b,float(p.get("x",0)),float(p.get("z",0))):
					touching = true
					break
			if not touching:
				for p in b:
					if _inside(a,float(p.get("x",0)),float(p.get("z",0))):
						touching = true
						break
			if not touching:
				for k in range(a.size()):
					if touching:
						break
					for m in range(b.size()):
						if _segment_distance(a[k],a[(k+1)%a.size()],b[m],b[(m+1)%b.size()])<=1.25:
							touching = true
							break
			if touching:
				neighbors[i].append(j)
				neighbors[j].append(i)
	return neighbors


static func _pair(a: String, b: String) -> String:
	return a+":"+b if a<b else b+":"+a


static func enumerate(source: Dictionary) -> Dictionary:
	var zones := regions(source)
	if zones.size()!=5:
		return {"ok":false,"error":"Se requieren cinco regiones principales.","options":[]}
	var east := -1
	for i in range(5):
		if (zones[i].get("points", []) as Array).size()<3:
			return {"ok":false,"error":"Zona sin polígono válido.","options":[]}
		if _is_east(zones[i]):
			if east!=-1:
				return {"ok":false,"error":"Hay más de una Zona Este.","options":[]}
			east=i
	if east==-1:
		return {"ok":false,"error":"No se encontró Zona Este.","options":[]}
	var forbidden: Dictionary = {}
	for item in source.get("biomeGenerator", {}).get("forbiddenPairs", []):
		if item is String:
			forbidden[item]=true
	var neighbors := _adjacency(zones)
	var options: Array = []
	_visit(0, [], IDS.duplicate(), east, neighbors, forbidden, options)
	return {"ok":true,"options":options,"east":east,"adjacency":neighbors}


static func _visit(index: int, chosen: Array, remaining: Array, east: int, near: Array, forbidden: Dictionary, options: Array) -> void:
	if index==5:
		options.append(chosen.duplicate())
		return
	for biome in IDS:
		if not remaining.has(biome) or (index==east and biome=="mountain"):
			continue
		var allowed := true
		for j in near[index]:
			if j < index and forbidden.has(_pair(biome,str(chosen[j]))):
				allowed=false
				break
		if not allowed:
			continue
		var left := remaining.duplicate()
		left.erase(biome)
		var next := chosen.duplicate()
		next.append(biome)
		_visit(index+1,next,left,east,near,forbidden,options)


static func current_index(source: Dictionary, options: Array) -> int:
	var zones := regions(source)
	for i in range(options.size()):
		var equal := true
		for k in range(zones.size()):
			if str(zones[k].get("biomeId","")) != str(options[i][k]):
				equal=false
				break
		if equal:
			return i
	return -1


static func apply_distribution(source: Dictionary, selected: Array) -> bool:
	var zones := regions(source)
	var enumeration := enumerate(source)
	if not enumeration.get("ok",false) or not (enumeration.get("options",[]) as Array).has(selected):
		return false
	var by_id: Dictionary = {}
	for i in range(zones.size()):
		by_id[str(zones[i].get("id",""))]=str(selected[i])
	var any_change := false
	for candidate in source.get("zones", []):
		if not (candidate is Dictionary):
			continue
		var assigned := ""
		if bool(candidate.get("isCliff",false)):
			assigned=str(by_id.get(str(candidate.get("cliffParentId","")),""))
		else:
			assigned=str(by_id.get(str(candidate.get("id","")),""))
		if assigned.is_empty():
			continue
		if str(candidate.get("biomeId",""))!=assigned:
			any_change=true
			candidate["biomeId"]=assigned
		if not bool(candidate.get("isCliff",false)):
			candidate["biomeLocked"]=false
	return any_change
