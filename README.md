# WILDTRAP — Editor modular de escenarios v0.4

**Fecha:** 10 noviembre 2026. **Estado:** editor técnico, no es todavía una partida jugable.

La aplicación anterior de expediciones procedurales fue retirada de la rama `main` a petición del usuario. Este repositorio sirve ahora como **herramienta para diseñar y guardar el terreno de WILDTRAP**. La historia de Git permite recuperar el antiguo código si alguna vez hiciera falta, pero no forma parte de la aplicación actual.

## Abrir
Si GitHub Pages está activado para la rama `main`, carpeta `/(root)`:
https://dtokurisu-png.github.io/wildtrap/

El editor tiene dos archivos activos: `index.html` y `editor.mjs`. Three.js se carga desde jsDelivr. Si falla la red o la importación, el arranque informa del error en lugar de quedarse esperando eternamente. No se han incluido modelos definitivos ni enemigos.

## Tamaño y perspectiva
- Terreno vacío inicial **630 × 630 unidades Three.js**: 50 % más anchura y longitud que los 420 × 420 previos.
- Malla de altura de 129 × 129 vértices con altitud entre 0 y la cota máxima configurable (inicialmente 48).
- Vista cenital ortográfica como vista inicial y vista tridimensional opcional.
- Pintura con herramientas **subir, bajar, nivelar y suavizar**, radio, intensidad y altura objetivo.
- Ratón: izquierdo dibujar/colocar, rueda zoom, central desplazar, derecho orbitar en vista 3D.

## Importación de altura desde una imagen
1. Crear una imagen limpia sin símbolos, flechas ni dibujos que representen otra cosa que alturas.
2. Usar tonalidades de verde: **más oscuro = más alto; más claro = más bajo**; blanco = altura baja. También se aceptan mapas de grises.
3. Elegir la altura máxima y pulsar **Importar PNG/JPG de alturas**.
4. El editor reescala la imagen a la malla de 129 × 129 y traduce su luminosidad en elevación.
5. Se puede seleccionar **Invertir alturas** para invertir el sentido de los tonos.
6. **Exportar alturas PNG** produce un mapa en escala de grises para evitar pérdidas al volver a importarlo; el archivo de proyecto JSON guarda los valores numéricos sin pérdida.

El importador toma la luminosidad del píxel, por lo que los trazos negros de un boceto también pasarían a ser montañas: se debe subir una **versión limpia exclusiva de alturas**.

## Herramientas de estructura
- **Anclaje**: punto reutilizable. Al crear camino/muro/escalera/compuerta cerca de un anclaje, el extremo queda unido a él.
- **Camino**: trazado entre dos extremos siguiendo las alturas locales de suelo.
- **Muro**: bloques segmentados con altura seleccionada.
- **Escalera**: peldaños entre dos puntos, ajustados a la diferencia de elevación; si están a nivel, aplica una subida configurable para previsualizar.
- **Compuerta**: estructura de barrotes entre dos puntos.
- **Montaña**: prefabricado independiente con base, relieve vertical, recorrido en espiral y boca de cueva en su parte superior. Se puede seleccionar, mover, ajustar altura y radio; **NO cambia la malla del terreno**. Geometría provisional que podrá sustituirse por un GLB más adelante.
- **Cueva**: prefabricado independiente con puerta visible en la superficie y sala cerrada bajo el suelo (cota Y=-15). Se puede seleccionar, mover y redimensionar. **Entrar a cueva elegida** oculta la superficie para inspeccionar su interior 3D; **Volver a superficie** restituye la vista normal.
- **Spawn árbol / spawn muro / respawn / salida**: marcadores de ubicación, sin instanciar objetos finales.
- **Seleccionar, mover, borrar, deshacer**; los caminos y muros se pueden seleccionar por proximidad al segmento.
- **Vaciar todo** deja el suelo plano y borra las estructuras del editor, con confirmación.

## Cuevas: colisión en el futuro juego
El editor construye y visualiza las dos capas. **Todavía no hay avatar, físicas, teletransporte ni colliders de juego**. Cuando el motor de juego consuma el JSON, la entrada tendrá un volumen de transición: al cruzarlo se cambia el estado a `interior`, se mantiene la colisión de las paredes de la cueva y se desactiva solo la colisión del tramo de superficie incompatible, nunca todas las paredes. Al salir, se restablece el estado `exterior`. Este protocolo evita atravesar terreno y salir a zonas inválidas.

## Guardado
- Borrador automático en el navegador mediante `localStorage` (no sincroniza con GitHub ni con otros equipos).
- **Exportar JSON** descarga la malla y las estructuras, para reutilizarlas en el motor de juego.
- **Importar JSON** permite volver a cargar ese proyecto.
- Se recomienda exportar JSON con frecuencia y conservar copias: la limpieza de datos del navegador elimina el borrador automático.

## Límites de la versión
Los bloques, montañas, cuevas, escaleras y barreras son **geometría provisional**. Aún no hay importación de modelos GLB, edición de topología interior por habitaciones, simulación de colisiones del personaje, navegación de criaturas, generación automática de árboles, IA, multijugador ni expedición. La cámara cenital y la conversión de mapas de altura existen, pero el render aún requiere una prueba de interacción real en navegador. No se ha afirmado que esta edición esté lista para producción.

## Desarrollo
No es necesario instalar nada si GitHub Pages ya está activado. Como es una aplicación ES Modules, para abrir localmente se necesita un servidor HTTP (no doble clic sobre `index.html`), por ejemplo `python -m http.server 8080`.


## v0.5 — Modo Probar: Farolera original y cámara sobre el hombro

Pulsar **▶ Probar** oculta los controles del editor y abre una vista jugable del **mismo terreno** que se esté editando o que se haya importado mediante PNG/JPG de alturas. No modifica la malla ni borra el proyecto: **Volver al editor** o **Esc** restauran la vista de edición y sus controles. La posición inicial es el primer marcador **Respawn**; si no hay uno, se usa una posición segura próxima a la esquina sureste del mapa.

- **WASD / flechas:** desplazarse relativo a la cámara. **Shift:** correr.
- **Arrastrar el ratón** (botón principal o secundario) sobre el escenario: girar libremente la cámara, que sigue a la Farolera desde cerca de un hombro; la cámara no gira automáticamente con el modelo.
- La Farolera intenta cargar el **GLB auténtico de R.O.K.** (sin cambiar el archivo original): `https://dtokurisu-png.github.io/rok-3d-test/assets/models/casters/farolera/chiara_idle.glb`. El GLB contiene al menos el clip **Idle** empleado por el visor R.O.K. y ese clip se reproduce mediante `THREE.AnimationMixer`.
- Se intenta cargar **de manera adicional y no bloqueante** la caminata FBX publicada en `rok-3d-test/animations/Walking.fbx`; si se consigue adaptar al esqueleto, se mezcla con el Idle. Si falla la adaptación o la red, la Farolera sigue visible con el Idle original y una animación procedural de extremidades durante el movimiento (fallback). No se asegura que la caminata sea idéntica a la animación 12 del visor.
- Si el modelo remoto falla, se muestra un **error visible** y se permite seleccionar un **GLB local (respaldo)** en el editor; no se sustituye silenciosamente por un muñeco.
- El personaje camina siguiendo la elevación de los datos del terreno y restringe pasos con diferencias verticales abruptas. **Esto es una prueba de movimiento**, no un controlador físico completo; muros, montañas prefabricadas, cuevas y entradas todavía no tienen colisiones jugables.

Esta función está separada en `playtest.mjs`, no altera la biblioteca de R.O.K. ni cambia los ajustes del mapa. El navegador necesita conexión para descargar Three.js y el GLB original, salvo que se seleccione uno local (Three.js sigue siendo externo).

La comprobación hasta ahora ha sido **estática** (sintaxis y conexiones entre HTML/JS); queda pendiente la validación visual real en un navegador con acceso a la página y a los recursos del modelo.


## v0.6 — Terreno base, perforación real y locomoción oficial

El terreno **630 × 630** del usuario se guardó **sin modificar** en [assets/terrain/wildtrap-terreno-base.json](assets/terrain/wildtrap-terreno-base.json), incluyendo sus 16 641 alturas originales y sus marcadores. Al abrir, el editor recupera primero el guardado automático local si existe; si no, importa el terreno base de GitHub. El botón **Cargar terreno base** permite restaurarlo tras confirmación (las modificaciones se pueden exportar previamente).

### Herramienta de agujeros
- Selecciona **Pintar selección** y el radio del pincel. Formas: circular, semicírculo orientable, cuadrada y trazo libre mediante arrastre.
- **Crear agujero** elimina los *triángulos reales* de las celdas seleccionadas de la geometría indexada de la heightmap. No se aplica color negro ni se desactivan ficticiamente todos los colliders.
- **Restaurar terreno** repone esas mismas celdas (incluidas sus alturas previas); **Limpiar selección** no modifica geometría. Funciona con Ctrl+Z y queda guardado con `holes: [indicesDeCelda]` en el JSON del proyecto.
- Las perforaciones se hacen sobre la malla principal; **las cuevas, techos de túnel y arcos siguen siendo modelos 3D independientes** que el usuario podrá colocar encima/debajo. No se generan automáticamente sus interiores ni colliders.
- En el modo de prueba, la Farolera **no puede caminar sobre celdas ausentes** mientras no exista un módulo navegable con suelo/colisión propios.

### Farolera
- Sigue siendo el **GLB original** `assets/models/casters/farolera/chiara_idle.glb` de R.O.K. Su escala en el mundo se redujo de **2.18 a 1.09 unidades de altura** (50 %). No cambia la escala del escenario.
- **WASD mueve con ejes absolutos del mundo**, independientemente de la rotación del ratón. El ratón **solo rota la cámara sobre el hombro**. Velocidad normal **2.6** (antes 5.2), Shift **4.25** (antes 8.5): disminución del 50 %.
- Idle = original incrustado en el GLB. **Único clip de caminata** = **animación #40 de las invocaciones** `Catwalk Walking.fbx`, del tester `arena-25d.html` de R.O.K., adaptada al rig Mixamo de la Farolera mediante el mismo patrón de retarget de ese tester.
- Se eliminó totalmente la animación procedural de brazos/piernas y no se usa `Walking.fbx` para caminar. Si el FBX oficial o su retarget falla, se muestra error explícito y permanece Idle, sin reemplazo inventado.

**Estado de validación:** se verificaron estáticamente los módulos y la correspondencia de controles, la identidad exacta del terreno base y con un ensayo de geometría se probó que el corte elimina triángulos y la restauración los repone. No se ha ejecutado una prueba visual en WebGL/Chrome sobre GitHub Pages; el aspecto de la retargetización requiere comprobación en navegador.


## v0.7 — Biblioteca modular de guaridas (fase 1)

La nueva categoría **Estructuras / Cuevas** ofrece seis mallas independientes en color gris:
**suelo**, **pared**, **bóveda**, **túnel abierto**, **rampa** y **cámara de jefe sin techo**.

Desde el editor puedes **colocarlas, seleccionarlas, moverlas, girarlas, modificar su anchura/altura/longitud/grosor, cambiar la escala y la elevación, duplicarlas y guardarlas en JSON**, manteniendo las funciones existentes de terreno, perforaciones y modo Probar.

Las piezas poseen una topología realmente **deformable por vértice**, UV y normales, más geometría interior separada en los módulos que la necesitan. Se probó la deformación regional con recuperación exacta de la posición editada al regenerar cada una de las seis mallas. Los cambios por vértice se representan mediante `vertexEdits` y quedan incluidos en el JSON al existir.

**Fases pendientes:** el pincel interactivo sobre los vértices de cada módulo (fase 2); exportación/importación y validación GLB de modelos deformados (fase 3); colisiones simplificadas y acabados finales (fase 4). El botón **Exportar JSON** actual no exporta GLB. El personaje del modo Probar aún no colisiona con los módulos de cuevas.

[Diseño y límites de la fase 1](docs/CAVE_LIBRARY_PHASE1.md) · [Pruebas automáticas](tests/cave-pieces.test.mjs)


## v0.8 — Pincel de corte 3D sobre acantilados

La herramienta antigua eliminaba **celdas completas X/Z** de la cuadrícula y, en una pared de mucho desnivel, un corte podía afectar toda su altura. La v0.8 sustituye ese recorte para los cortes nuevos por una operación en **espacio 3D**:

1. Pasa a **Vista 3D** y orienta la cámara hacia la pared del acantilado que quieras perforar.
2. Escoge **Pintar corte 3D** en la sección «Pincel de corte 3D».
3. Ajusta el **Radio del pincel**, la **Profundidad de corte** (por defecto ±2 unidades en dirección perpendicular a la cara), y la forma circular, semicircular, rectangular o trazo libre.
4. Pinta directamente sobre la superficie en 3D; se dibujan marcas ámbar en la cara tocada.
5. Pulsa **Crear agujero**: un algoritmo de recorte de prismas convexos divide solamente los triángulos interceptados, genera vértices en los bordes y elimina las regiones interiores. No aumenta los 129 × 129 vértices base.
6. Para recuperar total o parcialmente una abertura, pinta su región usando la malla original de referencia invisible (permite seleccionar el espacio ya perforado) y pulsa **Restaurar región**. **Borrar trazo pendiente** solo modifica la preselección, no el terreno.
7. Los recortes y restauraciones se guardan en el JSON como una lista cronológica `cuts3d` con posición `[x,y,z]`, normal, radio, profundidad, forma y acción. **Deshacer** y **Cargar terreno base** también gestionan esta lista.

**Compatibilidad:** los agujeros antiguos de celda completa se conservan en `holes` y siguen visualizándose. Los cortes nuevos no los convierten ni los borran automáticamente; la restauración 3D puede recuperar partes de un hueco antiguo. El proyecto guarda ambas representaciones sin cambiar las dimensiones 630 × 630 del escenario.

**Geometría:** el archivo [adaptive-terrain-cuts.mjs](adaptive-terrain-cuts.mjs) aplica diferencias exactas de polígonos convexos, con interpolación de UV, colores y normales; las caras intactas mantienen los vértices originales indexados. El cortador limita su profundidad para no borrar todas las superficies bajo el mismo X/Z. El módulo [terrain-holes.mjs](terrain-holes.mjs) maneja el raycast y la interfaz, y [tests/adaptive-terrain-cuts.test.mjs](tests/adaptive-terrain-cuts.test.mjs) verifica cortes, restauración, continuidad de datos y serialización. GitHub Actions ejecuta esas pruebas.

**Alcance:** el recorte abre la **superficie de la heightmap**, no genera automáticamente paredes interiores, bóvedas, suelos de cuevas, colisiones complejas ni un modelo 3D cerrado. El interior y la decoración siguen construyéndose con módulos independientes. La navegación de prueba usa todavía un controlador simplificado de terreno. La actualización requiere comprobación visual final en el navegador con un corte real sobre la pared.


## Hoja de desarrollo de WILDTRAP — expediciones y cooperación

**Documento de diseño (no implementado todavía):** [Hoja de desarrollo: cinco biomas, recursos, herramientas, fabricación, contratos y recompensas](docs/HOJA_DE_DESARROLLO_WILDTRAP.md).

Recoge las decisiones posteriores al documento del [Guardián de los Ecos](docs/PROPUESTA_GUARDIAN_DE_LOS_ECOS.md): cinco biomas (Bosque, Pantano, Desierto, Llanura y Cuevas), quince recursos iniciales propuestos, diez objetos fabricables, especies de árboles comunes y raras, extracción mediante herramientas o habilidades de guardianes, equipamiento con espacio limitado, fabricación costosa de herramientas de emergencia con componentes escasos y compartidos, intercambio entre aliados, almacén, tienda y quince tipos de contratos aleatorios con principal viable, secundarios opcionales y recompensa extraordinaria por huevos de jefes.

**Estado:** documentación de futuro diseño; este repositorio sigue siendo actualmente un editor de escenarios. Guardar la hoja **no** añade estos sistemas al juego.


## v0.9 — Cuatro modelos GLB del usuario + selección con Ctrl

Los cuatro GLB subidos a `assets/terrain/` son ahora los **únicos modelos del catálogo Estructuras / Cuevas**:
- `montañá.glb` — Montaña.
- `rocky ring 3d model.glb` — Cueva rocosa.
- `stone ruin 3d model.glb` — Cueva de piedra.
- `stylized rock ring 3d model.glb` — Cueva estilizada.

El editor carga los GLB mediante Three.js (sin modificar los originales), reutiliza mallas y materiales, y permite colocar instancias independientes con X, Z, altura Y, rotación y escala. Conserva la geometría original sin reconstrucción procedural. Los nodos se guardan como `{kind:"prefab",prefabId,x,z,offsetY,rotation,scale}`.

**Controles:** `Ctrl + clic izquierdo` añade o quita un objeto de la selección; `Ctrl + clic derecho arrastrando` selecciona los objetos que intersectan el rectángulo; la herramienta `Mover` desplaza los elementos seleccionados en conjunto. También se puede duplicar, eliminar, cambiar escala/rotación o deshacer.

Se han retirado de la interfaz **Importar mapa de alturas**, **Cueva bajo el terreno**, las seis piezas de cuevas procedurales anteriores y los botones antiguos de cueva y montaña. Se conservan las herramientas de relieve, perforación 3D, rutas, muros, escaleras, anclajes, spawns y el modo Probar.

### Escenario oficial para integrar con el juego futuro

El documento [assets/terrain/wildtrap-world.json](assets/terrain/wildtrap-world.json) define el escenario publicado (heightmap, nodos, cortes y catálogo de GLB). Cuando no hay borrador local, el editor abre este archivo; con **Abrir mapa publicado** puede recuperarse expresamente. El archivo `prefab-catalog.mjs` contiene los identificadores de los modelos para reutilizarlos desde el repositorio del juego.

**Persistencia actual:** los cambios del navegador se guardan automáticamente en localStorage y pueden exportarse/importarse en JSON. El archivo publicado `wildtrap-world.json` está versionado en GitHub, pero el navegador de GitHub Pages **no puede escribirlo directamente** sin un servicio autorizado; por tanto no se afirma que cada cambio local se sincronice automáticamente al repositorio. Para publicar una revisión se debe actualizar ese archivo mediante la conexión autorizada a GitHub, por ejemplo proporcionando el JSON exportado en esta conversación. Este límite se mantiene explícito para evitar perder cambios.

**Alcance del modo Probar:** se muestran los nuevos GLB, pero la Farolera conserva las colisiones del terreno anterior. La integración de colisión simplificada con los modelos GLB se evaluará por separado.

[Pruebas automáticas del editor y GLB](tests/editor-glb-integration.test.mjs)


## v0.9.1 — Galería visual de estructuras GLB

En **Estructuras / Cuevas**, el botón **Colocar modelo GLB · Ver modelos** abre una ventana con cuatro tarjetas: montaña, cueva rocosa, cueva de piedra y cueva estilizada.

Las miniaturas **no son imágenes genéricas**: `prefab-gallery.mjs` las renderiza directamente desde los GLB ya descargados por `prefab-library.mjs`, con una sola sesión WebGL y una caché de capturas PNG por ángulo. El menú ofrece cinco vistas: perspectiva 3D, frente, lado, atrás y arriba. Cada tarjeta muestra el modelo elegido desde el ángulo activo. Al pulsar una tarjeta se cierra la ventana y el editor activa el modo de colocación; el siguiente clic en el escenario añade una instancia independiente.

La galería se cierra con el botón de cerrar, Escape o clic fuera del panel; no modifica los GLB originales ni los datos del escenario hasta colocar un modelo. Las herramientas de terreno, cortes, selección múltiple, guardado y modo Probar quedan intactas.

Pruebas: `node --test tests/prefab-gallery.test.mjs`, incluidas en el flujo de GitHub Actions del editor.
