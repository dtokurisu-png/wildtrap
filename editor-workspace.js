/* WILDTRAP · Fase 1 · Espacio de trabajo.
   Los controles existentes se REUBICAN (no se clonan): se conservan sus ID
   y los listeners del motor, el JSON, el borrador y la vista de cámara. */
(function(){
 'use strict';
 const side=document.getElementById('side');
 if(!side||document.getElementById('workspaceTopbar'))return;
 const sections=Array.from(side.children).filter(el=>el.tagName==='SECTION');
 if(sections.length!==6)throw new Error('Estructura del editor no reconocida: no se reorganizaron los controles');
 const [project,sculpt,knife,logic,models,selection]=sections;
 const title=side.querySelector(':scope > h1');
 const subtitle=side.querySelector(':scope > small');
 const help=Array.from(side.children).find(el=>el.classList.contains('hint'));
 const $=id=>document.getElementById(id);
 const el=(tag,className,textValue)=>{
  const item=document.createElement(tag);
  if(className)item.className=className;
  if(textValue!==undefined)item.textContent=textValue;
  return item;
 };
 const storeKey='wildtrap-workspace-ui-v1';let saved=null;
 try{saved=JSON.parse(localStorage.getItem(storeKey)||'null')}catch(_){}
 let sizes=Array.isArray(saved?.sizes)&&saved.sizes.length===3&&saved.sizes.every(x=>Number.isFinite(x)&&x>.05)?saved.sizes.slice():[.28,.49,.23];
 const sizeTotal=sizes.reduce((a,b)=>a+b,0);sizes=sizes.map(x=>x/sizeTotal);
 let currentWorkspace='project';
 function saveLayout(){
  const tabPanes={};
  for(const tab of side.querySelectorAll('.dock-tab'))tabPanes[tab.dataset.tab]=Number(tab.closest('.dock-pane').dataset.pane);
  const active={};
  for(const pane of side.querySelectorAll('.dock-pane')){
   active[pane.dataset.pane]=pane.querySelector('.dock-tab.active')?.dataset.tab||null;
  }
  try{localStorage.setItem(storeKey,JSON.stringify({tabPanes,active,sizes,workspace:currentWorkspace,
   width:parseInt(getComputedStyle(document.documentElement).getPropertyValue('--workspace-dock'),10)}))}catch(_){}
 }
 // Barra de comandos: mover los botones REALES de su sección antigua.
 const topbar=el('header');topbar.id='workspaceTopbar';
 const brand=el('div','workspace-brand');brand.append(title,subtitle);
 const topActions=el('nav','workspace-top-actions');
 topActions.setAttribute('aria-label','Acciones del proyecto');
 for(const id of ['undo','reset','restoreBase','loadPublished','export']){
  const node=$(id);
  if(!node)throw new Error('Falta el control de proyecto '+id);
  if(id==='restoreBase'||id==='export')topActions.append(el('span','workspace-top-separator'));
  topActions.append(node);
 }
 const importLabel=$('importJSON').closest('label');
 topActions.append(importLabel);
 topbar.append(brand,topActions);
 document.body.prepend(topbar);
 // La herramienta de movimiento seguirá existiendo internamente: clic sobre objeto.
 const moveControl=sculpt.querySelector('[data-tool="move"]');
 if(moveControl){
  const holder=el('div');holder.hidden=true;holder.id='workspaceInternalActions';
  holder.append(moveControl);document.body.append(holder);
 }
 for(const grid of Array.from(project.querySelectorAll(':scope > .grid2'))){
  if(!grid.children.length)grid.remove();
 }
 // El botón Play es compacto, pero conserva su ID y su lógica de prueba.
 const rail=el('nav');rail.id='workspaceRail';rail.setAttribute('aria-label','Herramientas del editor');
 const toolbarEntries=[
  ['project','◉','Vista','Vista y proyecto'],
  ['sculpt','▲','Esculpir','Esculpir terreno'],
  ['knife','✂','Cuchillo','Cuchillo poligonal'],
  ['structures','▦','Estruct.','Estructuras'],
 ];
 const workspaceButtons=new Map();
 for(const [key,symbol,label,longLabel] of toolbarEntries){
  const button=el('button','workspace-tool');
  button.type='button';button.dataset.workspace=key;button.title=longLabel;
  button.setAttribute('aria-label',longLabel);
  button.setAttribute('aria-pressed','false');
  const icon=el('span','tool-symbol',symbol),name=el('span','tool-label',label);
  button.append(icon,name);rail.append(button);workspaceButtons.set(key,button);
 }
 const play=$('test');play.textContent='▶';
 play.title='Probar escenario (Play)';play.setAttribute('aria-label','Probar escenario');
 play.classList.add('workspace-tool','workspace-toolplay');
 play.removeAttribute('style');rail.append(play);
 document.body.insertBefore(rail,side);
 // Panel de propiedades de herramienta, reutilizando las seis secciones existentes.
 const toolViews=el('div');toolViews.id='workspaceToolViews';
 const structureView=el('div','workspace-section');structureView.dataset.workspaceContent='structures';
 structureView.append(logic,models);
 for(const [key,node] of [['project',project],['sculpt',sculpt],['knife',knife]]){
  node.classList.add('workspace-section');node.dataset.workspaceContent=key;
  node.hidden=key!=='project';toolViews.append(node);
 }
 structureView.hidden=true;toolViews.append(structureView);
 // Separar parámetros de objeto del catálogo (no duplicamos ningún ID).
 const objectEditor=el('div');objectEditor.id='workspaceObjectProperties';
 objectEditor.className='is-empty';
 const empty=el('div','workspace-empty');
 empty.innerHTML='<strong>No hay un modelo seleccionado</strong>Haz clic sobre una cueva, roca u otro modelo del escenario para mostrar sus propiedades aquí.';
 const modelFields=el('div','object-editor-fields');
 const modelGrids=Array.from(models.children).filter(child=>child.classList.contains('grid2'));
 for(const grid of modelGrids)modelFields.append(grid);
 const modelNotes=Array.from(models.querySelectorAll(':scope > p.hint'));
 for(const note of modelNotes.slice(1))modelFields.append(note);
 objectEditor.append(selection,empty,modelFields);
 const constraints=$('transformConstraints'),meshControls=$('meshEditControls');
 const terrainMeshControls=$('terrainMeshControls');
 if(!constraints||!meshControls||!terrainMeshControls)
  throw Error('Faltan controles de malla, terreno o transformación');
 objectEditor.append(constraints,terrainMeshControls,meshControls);
 const showProperties=el('button','scene-manager-action','Propiedades y malla del modelo seleccionado');
 showProperties.type='button';showProperties.id='structuresOpenObjectProperties';
 showProperties.addEventListener('click',()=>activateTab('object'));
 structureView.prepend(showProperties);
 // Galería GLB original, acoplada al área Estructuras: las cinco cámaras siguen
 // usando las vistas reales de cada archivo, sin modal ni segunda copia.
 const galleryRoot=$('prefabModal');
 if(!galleryRoot)throw new Error('No existe el catálogo de estructuras');
 models.append(galleryRoot);
 // Vista de objetos: Fase 1 crea la ventana, Fase 2 conectará el inventario vivo.
 const objectsView=el('div');
 objectsView.innerHTML='<h2>Objetos de la escena</h2><div class="workspace-empty"><strong>Gestor de objetos</strong>Esta ventana está preparada para mostrar únicamente modelos persistentes, agrupados por tipo. La lista sincronizada llegará en la Fase 2.</div>';
 const sceneView=el('div');
 sceneView.innerHTML='<h2>Jerarquía</h2><div class="workspace-inline-note">En la próxima fase podrás desplegar las cuevas, rocas, árboles colocados y grupos personales, sin incluir los spawns ni otros marcadores lógicos.</div>';
 const statusView=el('div');
 statusView.innerHTML='<h2>Estado del espacio de trabajo</h2><div class="workspace-inline-note">Puedes arrastrar una pestaña a cualquiera de las tres áreas y mover los separadores para cambiar su altura. La organización se guarda sin modificar el escenario.</div><p class="hint">Las herramientas siguen funcionando con los controles de su pestaña Propiedades.</p>';
 const helpView=el('div','workspace-help');
 helpView.innerHTML='<h2>Ayuda rápida</h2><p><kbd>Clic</kbd> seleccionar modelos.</p><p><kbd>Arrastrar</kbd> mover. <kbd>Shift</kbd> + arrastrar: escala. <kbd>Alt</kbd> + arrastrar: rotación.</p><p><kbd>Ctrl</kbd> + clic: selección múltiple.</p><p><kbd>Ctrl + Z</kbd> deshacer. <kbd>Esc</kbd> cancelar.</p>';
 if(help)helpView.append(help);
 const panes=[],contentAreas=[],tabBars=[];
 const defaults=[
  [{key:'objects',label:'Objetos',content:objectsView},{key:'scene',label:'Jerarquía',content:sceneView}],
  [{key:'tools',label:'Propiedades',content:toolViews},{key:'object',label:'Objeto',content:objectEditor}],
  [{key:'status',label:'Estado',content:statusView},{key:'help',label:'Ayuda',content:helpView}]
 ];
 const contents=new Map(),tabs=new Map();
 for(let i=0;i<3;i++){
  const pane=el('section','dock-pane');pane.dataset.pane=String(i);
  const bar=el('div','dock-tabs');bar.setAttribute('role','tablist');bar.setAttribute('aria-label','Pestañas del panel '+(i+1));
  const content=el('div','dock-content');
  pane.append(bar,content);panes.push(pane);tabBars.push(bar);contentAreas.push(content);
  if(i) {
   const divider=el('div','dock-splitter');divider.dataset.before=String(i-1);
   divider.setAttribute('role','separator');divider.setAttribute('aria-label','Cambiar altura de paneles');
   side.append(divider);
  }
  side.append(pane);
 }
 for(let i=0;i<3;i++)for(const item of defaults[i]){
  const btn=el('button','dock-tab',item.label);
  btn.type='button';btn.dataset.tab=item.key;btn.draggable=true;
  btn.setAttribute('role','tab');btn.setAttribute('aria-selected','false');
  const panel=el('div','dock-view');panel.dataset.tabView=item.key;panel.hidden=true;
  panel.setAttribute('role','tabpanel');panel.append(item.content);
  const fromSave=Number(saved?.tabPanes?.[item.key]);
  const target=Number.isInteger(fromSave)&&fromSave>=0&&fromSave<3?fromSave:i;
  tabBars[target].append(btn);contentAreas[target].append(panel);
  tabs.set(item.key,btn);contents.set(item.key,panel);
 }
 function activateTab(key){
  const btn=tabs.get(key),content=contents.get(key);
  if(!btn||!content)return;
  const pane=btn.closest('.dock-pane');
  for(const b of pane.querySelectorAll('.dock-tab')){
   const active=b===btn;
   b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));
  }
  for(const item of pane.querySelectorAll('.dock-view'))item.hidden=item!==content;
  saveLayout();
 }
 for(const [key,btn] of tabs){
  btn.addEventListener('click',()=>activateTab(key));
  btn.addEventListener('dragstart',event=>{
   event.dataTransfer.setData('text/plain',key);
   event.dataTransfer.effectAllowed='move';
  });
 }
 for(let i=0;i<3;i++){
  const bar=tabBars[i];
  bar.addEventListener('dragover',e=>{
   e.preventDefault();e.dataTransfer.dropEffect='move';bar.classList.add('drag-over');
  });
  bar.addEventListener('dragleave',()=>bar.classList.remove('drag-over'));
  bar.addEventListener('drop',e=>{
   e.preventDefault();bar.classList.remove('drag-over');
   const key=e.dataTransfer.getData('text/plain');
   const button=tabs.get(key),panel=contents.get(key);
   if(!button||!panel)return;
   const prior=button.closest('.dock-pane');
   bar.append(button);contentAreas[i].append(panel);
   if(prior!==panes[i]){
    const remaining=prior.querySelector('.dock-tab');
    if(remaining)activateTab(remaining.dataset.tab);
   }
   activateTab(key);
  });
 }
 // Restaurar pestañas activas. Si no hay valor guardado, primera de cada área.
 for(let i=0;i<3;i++){
  const wished=saved?.active?.[i];
  const button=wished&&tabs.get(wished)?.closest('.dock-pane')===panes[i]?tabs.get(wished):panes[i].querySelector('.dock-tab');
  if(button)activateTab(button.dataset.tab);
 }
 const selectWorkspace=(key,triggerTool=true)=>{
  if(!workspaceButtons.has(key))return;
  currentWorkspace=key;
  for(const [name,button] of workspaceButtons)button.setAttribute('aria-pressed',String(name===key));
  for(const section of toolViews.querySelectorAll('.workspace-section'))section.hidden=section.dataset.workspaceContent!==key;
  activateTab('tools');
  if(triggerTool){
   const mode={project:'move',sculpt:'raise',knife:'holePaint',structures:'move'}[key];
   if(mode)document.querySelector('[data-tool="'+mode+'"]')?.click();
  }
  saveLayout();
  window.dispatchEvent(new CustomEvent('wildtrap:workspace-tool',{detail:{key}}));
 };
 for(const [key,button] of workspaceButtons)button.addEventListener('click',()=>selectWorkspace(key,true));
 // Acceso rápido a las vistas al mantener presionado el botón Vista.
 const viewFlyout=el('div','workspace-flyout');
 viewFlyout.id='workspaceViewFlyout';viewFlyout.hidden=true;
 const flyTitle=el('div','hint','Vistas del escenario');
 viewFlyout.append(flyTitle);
 for(const [id,label] of [['top','Vista cenital'],['angle','Vista 3D']]){
  const action=el('button','',label);action.type='button';
  action.addEventListener('click',()=>{$(id).click();viewFlyout.hidden=true;});
  viewFlyout.append(action);
 }
 document.body.append(viewFlyout);
 const projectButton=workspaceButtons.get('project');
 let hold=null;
 projectButton.addEventListener('pointerdown',()=>{clearTimeout(hold);hold=setTimeout(()=>{viewFlyout.hidden=false;},480)});
 for(const eventName of ['pointerup','pointercancel','pointerleave']){
  projectButton.addEventListener(eventName,()=>clearTimeout(hold));
 }
 document.addEventListener('pointerdown',event=>{
  if(!viewFlyout.contains(event.target)&&event.target!==projectButton)viewFlyout.hidden=true;
 });
 // Seleccionar un objeto abre su pestaña de propiedades; al tocar una herramienta
 // vuelve a mostrarse el panel de esa herramienta. No alteramos los eventos de escena.
 const selectedLabel=$('selected');
 let previousSelectionLabel='';
 function syncSelection(){
  const label=selectedLabel.textContent||'';
  const hasSelection=label.includes('ID ')||label.includes('Terreno de la arena')||/\b\d+ elementos seleccionados/.test(label);
  objectEditor.classList.toggle('is-empty',!hasSelection);
  // Solo abrir la pestaña cuando cambia la selección. Una herramienta activa
  // no debe perder su propio panel por llamadas repetidas a updateStatus().
  if(hasSelection&&label!==previousSelectionLabel)activateTab('object');
  previousSelectionLabel=label;
 }
 new MutationObserver(syncSelection).observe(selectedLabel,{childList:true,subtree:true,characterData:true});
 // Tamaños independientes; el separador solo afecta a los dos paneles vecinos.
 function applySizes(){
  const usable=Math.max(330,side.clientHeight-14);
  for(let i=0;i<3;i++)panes[i].style.height=Math.round(usable*sizes[i])+'px';
 }
 for(const divider of side.querySelectorAll('.dock-splitter')){
  divider.addEventListener('pointerdown',event=>{
   if(event.button!==0)return;
   event.preventDefault();divider.classList.add('dragging');
   divider.setPointerCapture(event.pointerId);
   const before=Number(divider.dataset.before),after=before+1;
   const start=event.clientY,a=panes[before].getBoundingClientRect().height,b=panes[after].getBoundingClientRect().height;
   const available=Math.max(330,side.clientHeight-14);
   const move=e=>{
    const first=Math.max(110,Math.min(a+b-110,a+e.clientY-start));
    sizes[before]=first/available;sizes[after]=(a+b-first)/available;applySizes();
   };
   const finish=()=>{
    divider.classList.remove('dragging');
    divider.removeEventListener('pointermove',move);
    divider.removeEventListener('pointerup',finish);
    divider.removeEventListener('pointercancel',finish);
    saveLayout();
   };
   divider.addEventListener('pointermove',move);
   divider.addEventListener('pointerup',finish);
   divider.addEventListener('pointercancel',finish);
  });
 }
 // El ancho del dock también puede ajustarse sin afectar al motor del editor.
 const widthHandle=el('div','workspace-dock-grip');widthHandle.title='Arrastrar para cambiar ancho del panel';
 side.append(widthHandle);
 const setDockWidth=value=>{
  const max=Math.max(220,window.innerWidth-180);
  document.documentElement.style.setProperty('--workspace-dock',Math.round(Math.min(max,Math.max(220,value)))+'px');
 };
 if(Number.isFinite(saved?.width)&&saved.width>0)setDockWidth(saved.width);
 widthHandle.addEventListener('pointerdown',event=>{
  if(event.button!==0)return;
  event.preventDefault();widthHandle.setPointerCapture(event.pointerId);
  widthHandle.classList.add('dragging');
  const begin=event.clientX;
  const original=side.getBoundingClientRect().width;
  const move=e=>{setDockWidth(original+begin-e.clientX);window.dispatchEvent(new Event('resize'));};
  const finish=()=>{
   widthHandle.classList.remove('dragging');
   widthHandle.removeEventListener('pointermove',move);
   widthHandle.removeEventListener('pointerup',finish);
   widthHandle.removeEventListener('pointercancel',finish);
   saveLayout();
  };
  widthHandle.addEventListener('pointermove',move);
  widthHandle.addEventListener('pointerup',finish);
  widthHandle.addEventListener('pointercancel',finish);
 });
 window.addEventListener('resize',applySizes);
 applySizes();
 selectWorkspace(['project','sculpt','knife','structures'].includes(saved?.workspace)?saved.workspace:'project',false);
 syncSelection();
 window.__workspaceLayout={
  open:key=>selectWorkspace(key,true),
  activateTab,
  getState:()=>({workspace:currentWorkspace,sizes:sizes.slice(),panes:panes.map(p=>Array.from(p.querySelectorAll('.dock-tab')).map(b=>b.dataset.tab))})
 };
})();
