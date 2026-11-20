@tool
extends RefCounted
## Dynamic zone masks match the original procedural polygons. Used for live
## Godot editor preview AND saved PNG masks in the native repository.
const BIOMES := ["forest","desert","plains","swamp","mountain"]
const RESOLUTION := 512


static func _inside(poly: Array, x: float, z: float) -> bool:
	var hit := false
	var prev := poly.size()-1
	for i in range(poly.size()):
		var a: Dictionary = poly[i]
		var b: Dictionary = poly[prev]
		var az := float(a.get("z",0))
		var bz := float(b.get("z",0))
		if (az > z)!=(bz > z) and x < (float(b.get("x",0))-float(a.get("x",0)))*(z-az)/(bz-az)+float(a.get("x",0)):
			hit=not hit
		prev=i
	return hit


static func make(source: Dictionary) -> Dictionary:
	var result: Dictionary = {}
	for biome in BIOMES:
		var img := Image.create_empty(RESOLUTION,RESOLUTION,false,Image.FORMAT_RGBA8)
		img.fill(Color(0,0,0,1))
		result[biome]=img
	var size := float(source.get("size",630))
	var half := size/2.0
	for zone in source.get("zones",[]):
		if not (zone is Dictionary) or bool(zone.get("isCliff",false)) or bool(zone.get("hidden",false)):
			continue
		var biome := str(zone.get("biomeId",""))
		if not result.has(biome):
			continue
		var poly: Array = zone.get("points",[])
		if poly.size()<3:
			continue
		var min_x := INF
		var max_x := -INF
		var min_z := INF
		var max_z := -INF
		for point in poly:
			min_x=minf(min_x,float(point.get("x",0)))
			max_x=maxf(max_x,float(point.get("x",0)))
			min_z=minf(min_z,float(point.get("z",0)))
			max_z=maxf(max_z,float(point.get("z",0)))
		var left := maxi(0, int(floor((min_x+half)/size*RESOLUTION))-1)
		var right := mini(RESOLUTION-1,int(ceil((max_x+half)/size*RESOLUTION))+1)
		var top := maxi(0,int(floor((half-max_z)/size*RESOLUTION))-1)
		var bottom := mini(RESOLUTION-1,int(ceil((half-min_z)/size*RESOLUTION))+1)
		var img: Image = result[biome]
		for py in range(top,bottom+1):
			var z := half-(float(py)+0.5)/RESOLUTION*size
			for px in range(left,right+1):
				var x := (float(px)+0.5)/RESOLUTION*size-half
				if _inside(poly,x,z):
					img.set_pixel(px,py,Color(1,1,1,1))
	return result


static func make_zone_mask(source: Dictionary, zone: Dictionary) -> Image:
	var img := Image.create_empty(RESOLUTION,RESOLUTION,false,Image.FORMAT_RGBA8)
	img.fill(Color(0,0,0,1))
	if not bool(zone.get("hidden",false)):
		_paint_polygon(img,zone.get("points",[]),float(source.get("size",630)))
	return img


static func make_cliff_mask(source: Dictionary) -> Image:
	var img := Image.create_empty(RESOLUTION,RESOLUTION,false,Image.FORMAT_RGBA8)
	img.fill(Color(0,0,0,1))
	for zone in source.get("zones",[]):
		if zone is Dictionary and bool(zone.get("isCliff",false)) and not bool(zone.get("hidden",false)):
			_paint_polygon(img,zone.get("points",[]),float(source.get("size",630)))
	return img


static func _paint_polygon(img: Image, poly: Array, world_size: float) -> void:
	if poly.size()<3 or world_size<=0.0:
		return
	var half := world_size/2.0
	var min_x := INF
	var max_x := -INF
	var min_z := INF
	var max_z := -INF
	for point in poly:
		min_x=minf(min_x,float(point.get("x",0)))
		max_x=maxf(max_x,float(point.get("x",0)))
		min_z=minf(min_z,float(point.get("z",0)))
		max_z=maxf(max_z,float(point.get("z",0)))
	var left := maxi(0,int(floor((min_x+half)/world_size*RESOLUTION))-1)
	var right := mini(RESOLUTION-1,int(ceil((max_x+half)/world_size*RESOLUTION))+1)
	var top := maxi(0,int(floor((half-max_z)/world_size*RESOLUTION))-1)
	var bottom := mini(RESOLUTION-1,int(ceil((half-min_z)/world_size*RESOLUTION))+1)
	for py in range(top,bottom+1):
		var z := half-(float(py)+0.5)/RESOLUTION*world_size
		for px in range(left,right+1):
			var x := (float(px)+0.5)/RESOLUTION*world_size-half
			if _inside(poly,x,z):
				img.set_pixel(px,py,Color(1,1,1,1))


## Parent-biome attribution matches cliff-zone-bindings.mjs / original renderer.
static func make_cliff_biome_masks(source: Dictionary) -> Dictionary:
	var result: Dictionary={}
	var parents: Dictionary={}
	for zone in source.get("zones",[]):
		if not (zone is Dictionary):
			continue
		if not bool(zone.get("isCliff",false)):
			parents[str(zone.get("id",""))]=str(zone.get("biomeId",""))
	for biome in BIOMES:
		var image := Image.create_empty(RESOLUTION,RESOLUTION,false,Image.FORMAT_RGBA8)
		image.fill(Color(0,0,0,0))
		result[biome]=image
	for zone in source.get("zones",[]):
		if not (zone is Dictionary) or not bool(zone.get("isCliff",false)) or bool(zone.get("hidden",false)):
			continue
		var biome := str(parents.get(str(zone.get("cliffParentId","")),""))
		if not result.has(biome):
			continue
		var img: Image=result[biome]
		_paint_polygon(img,zone.get("points",[]),float(source.get("size",630)))
	return result


static func save_cliff_pngs(images: Dictionary) -> bool:
	for biome in BIOMES:
		var image: Image=images.get(biome)
		if image==null:
			return false
		var dest:=ProjectSettings.globalize_path("res://data/masks/cliff_%s.png" % biome)
		if image.save_png(dest)!=OK:
			push_error("No se pudo guardar la máscara de acantilados "+biome)
			return false
	return true


static func save_pngs(images: Dictionary) -> bool:
	for biome in BIOMES:
		var image: Image = images.get(biome)
		if image == null:
			return false
		var full_path := ProjectSettings.globalize_path("res://data/masks/%s.png" % biome)
		if image.save_png(full_path)!=OK:
			push_error("No se pudo guardar la máscara de "+biome)
			return false
	return true
