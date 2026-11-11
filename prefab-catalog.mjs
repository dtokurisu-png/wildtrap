// Canonical WILDTRAP model catalog; safe to reuse from the future game repository.
export const PREFABS=Object.freeze([
 {id:'mountain',name:'Montaña',file:'montañá.glb',span:65},
 {id:'rocky-cave',name:'Cueva rocosa',file:'rocky ring 3d model.glb',span:46},
 {id:'stone-cave',name:'Cueva de piedra',file:'stone ruin 3d model.glb',span:46},
 {id:'stylized-cave',name:'Cueva estilizada',file:'stylized rock ring 3d model.glb',span:46}
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
