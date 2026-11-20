// Godot owns its JSON after import; the old browser snapshot may legitimately
// differ and must never overwrite native edits. Keep the structural contract.
import {readFileSync} from 'node:fs';
const native=JSON.parse(readFileSync('godot/data/world.json','utf8'));
if(native.size!==630||native.resolution!==129||native.heights?.length!==16641)
 throw Error('Native source terrain structure changed unexpectedly');
const main=native.zones.filter(z=>!z.isCliff);
if(main.length!==5||native.zones.length!==16)
 throw Error('Native project must preserve five zones and 11 original cliffs');
const east=main.filter(z=>/\beste\b/i.test(z.name||''));
if(east.length!==1||east[0].biomeId==='mountain')
 throw Error('Mountain is forbidden in the East main region');
for(const cliff of native.zones.filter(z=>z.isCliff)){
 if(!main.some(z=>z.id===cliff.cliffParentId))
  throw Error('Orphan cliff: '+cliff.id);
}
console.log('WILDTRAP_CANONICAL_WORLD_OK');
