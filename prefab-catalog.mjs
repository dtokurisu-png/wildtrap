// Canonical WILDTRAP model catalog; safe to reuse from the future game repository.
export const PREFABS=Object.freeze([
 {id:'mountain',name:'Montaña',file:'montañá.glb',span:65},
 {id:'rocky-cave',name:'Cueva rocosa',file:'rocky ring 3d model.glb',span:46},
 {id:'stone-cave',name:'Cueva de piedra',file:'stone ruin 3d model.glb',span:46},
 {id:'stylized-cave',name:'Cueva estilizada',file:'stylized rock ring 3d model.glb',span:46},
 {id:'cliffside-path',name:'Camino de acantilado',file:'cliffside path 3d model.glb',span:46},
 {id:'floating-rock-2',name:'Formación rocosa flotante 2',file:'floating rock formation 3d model 2.glb',span:35},
 {id:'cave-floor-1',name:'Piso de cueva 1',file:'piso de cueva 1.glb',span:46},
 {id:'rock-formation-1',name:'Formación rocosa 1',file:'rock formation 3d model 1.glb',span:35},
 {id:'rock-pillar-3',name:'Pilar rocoso 3',file:'rock pillar 3d model 3.glb',span:35},
 {id:'rock-pillar-4',name:'Pilar rocoso 4',file:'rock pillar 3d model 4.glb',span:35},
 {id:'cave-roof-2',name:'Techo de cueva 2',file:'techo de cueva 2.glb',span:46},
 {id:'cave-roof-3',name:'Techo de cueva 3',file:'techo de cueva 3.glb',span:46},
 {id:'cave-roof-4',name:'Techo de cueva 4',file:'techo de cueva 4.glb',span:46},
 {id:'cave-roof-6',name:'Techo de cueva 6',file:'techo de cueva 6.glb',span:46},
 {id:'cave-roof',name:'Techo de cueva',file:'techo de cueva.glb',span:46}
]);
export const prefabById=id=>PREFABS.find(p=>p.id===id);

// Only the three cave modules may penetrate and float inside the heightmap.
// The mountain and all other objects remain automatically anchored to terrain.
export const isFreeCave=prefabId=>prefabId==='rocky-cave'||
 prefabId==='stone-cave'||prefabId==='stylized-cave';
// "y" is an absolute world height for caves. Old saved caves with offsetY
// continue to load at their old position until first moved/edited.
export function prefabWorldY(node,heightAt){
 const ground=heightAt(Number(node.x)||0,Number(node.z)||0);
 if(!isFreeCave(node.prefabId))return ground;
 return typeof node.y==='number'&&Number.isFinite(node.y)?
  node.y:ground+(Number(node.offsetY)||0);
}
