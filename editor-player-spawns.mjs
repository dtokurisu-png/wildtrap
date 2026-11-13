// Editor de posiciones persistentes de jugadores. Los personajes se instancian en runtime.
export const PLAYER_SPAWN_MAX=6;
export function normalizePlayerSlot(slot){
 const n=Number(slot);
 return Number.isInteger(n)&&n>=1&&n<=PLAYER_SPAWN_MAX?n:1;
}
export function getPlayerSpawn(nodes,slot=1){
 return (Array.isArray(nodes)?nodes:[]).find(n=>n?.kind==='playerSpawn'&&normalizePlayerSlot(n.playerSlot)===normalizePlayerSlot(slot))||null;
}
export function createPlayerSpawnPanel({live,onPlace,onRemove}){
 const $=id=>document.getElementById(id);
 const select=$('playerSpawnSlot'),status=$('playerSpawnStatus'),list=$('playerSpawnList');
 function slot(){return normalizePlayerSlot(select.value)}
 function refresh(){
  const current=slot(),record=getPlayerSpawn(live.nodes,current);
  status.textContent=record?
   'Jugador '+current+' · X '+record.x.toFixed(1)+' · Z '+record.z.toFixed(1)+' · listo para probar':
   'Jugador '+current+' · sin punto definido. Pulsa Colocar / mover y haz clic en el terreno.';
  $('playerSpawnRemove').disabled=!record;
  list.replaceChildren();
  for(let i=1;i<=PLAYER_SPAWN_MAX;i++){
   const n=getPlayerSpawn(live.nodes,i);
   const row=document.createElement('div');
   row.style.cssText='display:flex;gap:5px;align-items:center;margin:5px 0';
   const button=document.createElement('button');
   button.style.flex='1';button.textContent='J'+i+' · '+(n?'X '+n.x.toFixed(1)+' · Z '+n.z.toFixed(1):'sin colocar');
   button.classList.toggle('active',i===current);
   button.onclick=()=>{select.value=String(i);refresh()};
   row.append(button);list.append(row);
  }
 }
 select.onchange=refresh;
 $('playerSpawnPlace').onclick=()=>onPlace(slot());
 $('playerSpawnRemove').onclick=()=>onRemove(slot());
 refresh();
 return {refresh,getSelectedSlot:slot};
}
