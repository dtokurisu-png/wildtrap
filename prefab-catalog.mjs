// Canonical WILDTRAP model catalog; safe to reuse from the future game repository.
export const PREFABS=Object.freeze([
 {id:'mountain',name:'Montaña',file:'montañá.glb',span:65},
 {id:'rocky-cave',name:'Cueva rocosa',file:'rocky ring 3d model.glb',span:46},
 {id:'stone-cave',name:'Cueva de piedra',file:'stone ruin 3d model.glb',span:46},
 {id:'stylized-cave',name:'Cueva estilizada',file:'stylized rock ring 3d model.glb',span:46}
]);
export const prefabById=id=>PREFABS.find(p=>p.id===id);
