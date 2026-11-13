import assert from 'node:assert/strict';
import {createPlaytestCollider} from '../playtest-collision.mjs';
class Vec3 {
 constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
 copy(v){this.x=v.x;this.y=v.y;this.z=v.z;return this;}
 applyMatrix3(){return this;}
 normalize(){let s=Math.hypot(this.x,this.y,this.z)||1;this.x/=s;this.y/=s;this.z/=s;return this;}
}
class Raycaster {
 set(origin,direction){this.origin=origin;this.direction=direction;}
 intersectObjects(meshes){return meshes.flatMap(mesh=>mesh.mockHits?.(this)||[]).sort((a,b)=>a.distance-b.distance);}
}
const THREE={Vector3:Vec3,Matrix3:class{getNormalMatrix(){return this;}},Raycaster,DoubleSide:2};
const make=(name,hit)=>({name,visible:true,isMesh:true,geometry:{attributes:{position:{count:3}}},material:{side:0},userData:{},children:[],matrixWorld:{},updateWorldMatrix(){},mockHits:hit});
const terrain=make('cut terrain',()=>[]); // hole: no triangle at the opening
const floor=make('cave floor',ray=>ray.direction.y<0?[
 {object:floor,point:{x:ray.origin.x,y:-4,z:ray.origin.z},distance:ray.origin.y+4,face:{normal:new Vec3(0,1,0)}}
]:[]);
const wall=make('uncut cave wall',ray=>ray.direction.y===0?[
 {object:wall,point:{x:ray.origin.x+ray.direction.x*.2,y:ray.origin.y,z:ray.origin.z},distance:.2,face:{normal:new Vec3(1,0,0)}}
]:[]);
const layer={visible:true,userData:{},children:[floor]};
const detector=createPlaytestCollider({THREE,terrain,roots:[layer]});
assert.equal(detector.refresh(),2);
assert.equal(terrain.material.side,2);
assert.equal(floor.material.side,2);
assert.equal(detector.blocked(0,0,0,1,0),false,'A cut hole must be traversable');
assert.equal(detector.floorAt(0,0,0)?.y,-4,'Cave floor below terrain must support player');
const noFloor=createPlaytestCollider({THREE,terrain,roots:[]});
noFloor.refresh();
assert.equal(noFloor.floorAt(0,0,0),null,'A hole with no cave floor must permit falling');
noFloor.restore();
layer.children.push(wall);
detector.refresh();
assert.equal(detector.blocked(0,0,0,1,0),true,'Uncut cave wall must block a capsule probe');
detector.restore();
assert.equal(floor.material.side,0);
assert.equal(wall.material.side,0);
console.log('PASS: cut openings pass, cave floor supports, uncut walls block, material state restores');
