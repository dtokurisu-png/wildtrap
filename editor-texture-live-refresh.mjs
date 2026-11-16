// Live replacement detection for versioned PNGs in GitHub Pages.
// Store exact unmodified asset URLs in the user's project. Cache-busting is
// presentation-only and never changes saved paths, masks, geometry or seams.
export const TEXTURE_COMMITS_API=
 'https://api.github.com/repos/dtokurisu-png/wildtrap/commits?path=assets%2Fterrain%2Ftexturas&per_page=1';

export function revisionedTextureUrl(url,revision){
 if(typeof url!=='string'||!url||!revision)return url;
 // Local repo images only. Imported data URLs or external image references
 // must never be rewritten.
 if(!url.startsWith('./assets/terrain/texturas/'))return url;
 const separator=url.includes('?')?'&':'?';
 return url+separator+'wt_texture_revision='+encodeURIComponent(String(revision));
}

export function createTextureRevisionWatcher({
 onRevision=()=>{},onStatus=()=>{},
 request=typeof fetch==='function'?fetch.bind(globalThis):null,
 host=typeof window!=='undefined'?window:null,
 page=typeof document!=='undefined'?document:null,
 intervalMs=90000
}={}){
 let revision='editor-0.9.107',latestSha=null,disposed=false,inFlight=null;
 let pollId=null,retries=[],lastCheck=0;
 const interval=Math.max(90000,Number(intervalMs)||90000);
 const notify=label=>{if(!disposed)onStatus(label)};
 function update(rev,{force=false}={}){
  if(disposed||(!force&&rev===revision))return false;
  revision=rev;
  onRevision(revision);
  return true;
 }
 async function check(force=false){
  if(disposed||!request)return false;
  if(!force&&page?.hidden)return false;
  if(inFlight)return inFlight;
  if(!force&&Date.now()-lastCheck<15000)return false;
  lastCheck=Date.now();
  inFlight=(async()=>{
   try{
    const response=await request(TEXTURE_COMMITS_API,{
     cache:'no-store',headers:{Accept:'application/vnd.github+json'}
    });
    if(!response?.ok)throw Error('HTTP '+(response?.status||'offline'));
    const result=await response.json();
    const sha=Array.isArray(result)?result[0]?.sha:null;
    if(!/^[0-9a-f]{40}$/i.test(sha||''))throw Error('versión inválida');
    // On first check, use content-revision URL to bypass existing browser
    // caches. On subsequent checks, a commit with replaced PNGs changes it.
    const first=latestSha===null,changed=latestSha!==sha;
    latestSha=sha;
    if(changed){
     update('git-'+sha.slice(0,16));
     notify(first?'Texturas verificadas':'Nuevas texturas detectadas');
     if(!first){
      // A GitHub commit can precede Pages deployment. Give the CDN time
      // to finish publishing, then refetch only textures (never the scene).
      for(const ms of [45000,120000]){
       const id=host?.setTimeout?.(()=>{
        retries=retries.filter(item=>item!==id);
        update('git-'+sha.slice(0,16)+'-recheck-'+ms,{force:true});
       },ms);
       if(id!=null)retries.push(id);
      }
     }
    }
    return changed;
   }catch(error){
    notify('Sin conexión para comprobar texturas');
    return false;
   }finally{inFlight=null}
  })();
  return inFlight;
 }
 function refreshNow(){
  const nonce='manual-'+Date.now().toString(36);
  update(nonce,{force:true});
  notify('Texturas recargadas');
  // A manual force does not reset the remote commit watcher state.
  return nonce;
 }
 function onFocus(){void check()}
 function onVisible(){if(!page?.hidden)void check()}
 function start(){
  if(disposed)return;
  host?.addEventListener?.('focus',onFocus);
  page?.addEventListener?.('visibilitychange',onVisible);
  pollId=host?.setInterval?.(()=>{void check()},interval);
  void check(true);
 }
 function dispose(){
  disposed=true;
  if(pollId!=null)host?.clearInterval?.(pollId);
  for(const id of retries)host?.clearTimeout?.(id);
  retries=[];
  host?.removeEventListener?.('focus',onFocus);
  page?.removeEventListener?.('visibilitychange',onVisible);
 }
 return {start,check,refreshNow,dispose,
  getRevision:()=>revision,getRemoteCommit:()=>latestSha};
}
