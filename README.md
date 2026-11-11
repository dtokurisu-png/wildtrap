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


## v0.9.4 — Pincel de corte 3D también sobre los GLB

Las herramientas **Pintar corte 3D** y **Borrar trazo pendiente** entran en un modo de edición exclusivo que deshabilita temporalmente la selección, el movimiento y los gestos de escala/rotación de los modelos. El raycast compara la geometría original del terreno y las superficies originales de los GLB colocados, y elige la superficie 3D visible más cercana.

**Cómo utilizar:** activa Pintar corte 3D, haz clic o arrastra por una pared de una cueva GLB o la montaña, revisa el contorno ámbar y pulsa **Crear agujero**. El recorte elimina únicamente las caras de la superficie tocadas por el prisma del pincel y añade vértices locales en el borde. Para reparar parte de la abertura, pinta esa región y pulsa **Restaurar región**. Los cortes del terreno continúan en `live.cuts3d`; los de modelos se guardan en `live.nodes[i].cuts3d`, expresados en coordenadas locales de su instancia, por lo que siguen al modelo cuando se mueve, rota o escala. El GLB fuente en `assets/terrain/` nunca se modifica; cada instancia se reconstruye a partir del original al restaurar, deshacer o importar un JSON.

El núcleo [adaptive-model-cuts.mjs](adaptive-model-cuts.mjs) recorta triángulos con interpolación de UV/normales/colores y conserva los grupos de materiales. No altera la cuadrícula del terreno ni genera automáticamente paredes de espesor, interiores de cuevas o colisiones físicas completas de los GLB; se trata de **cortes reales de superficie**, no de un booleano volumétrico cerrado. Hay límites de 80 trazos por instancia para evitar crecimiento excesivo de la malla. Las mallas animadas/skinned no se recortan por este método.

Verificación: [tests/adaptive-model-cuts.test.mjs](tests/adaptive-model-cuts.test.mjs) comprueba agujeros parciales, restauración, UV, grupos de materiales, geometrías indexadas/no indexadas y la prioridad del pincel frente a selección y arrastre.

## v0.9.8 — Cuchillo poligonal (sin pincel de corte)

La herramienta **✂ Activar cuchillo** reemplaza el estampado continuo del pincel. Cada clic sobre el terreno o la superficie de una instancia GLB añade **un vértice de control**. Una línea une el último vértice con la posición del cursor; al volver a hacer clic cerca del primer punto el contorno se cierra. **Cerrar contorno** permite cerrarlo manualmente. Solo entonces se habilitan **Crear agujero** y **Restaurar región**. **Deshacer punto**, Retroceso y Escape corrigen o cancelan el dibujo; Ctrl+Z deshace un recorte ya aplicado.

Cada contorno cerrado se guarda como **un único objeto** con `shape:"polygon"`, `polygon:[[u,v],...]`, `center`, `normal` y `depth`, sin cientos de sellos superpuestos. El motor recorta exactamente el polígono convexo; los polígonos cóncavos sencillos se descomponen internamente en triángulos únicamente para efectuar las operaciones geométricas. No se crean vértices de **control** adicionales, aunque la triangulación de la malla sí puede requerir vértices de intersección sobre las aristas (por ejemplo, si cruzan triángulos existentes). Se rechazan polígonos autointersecados o degenerados.

Los contornos guardados en el terreno siguen en `cuts3d`, y los de GLB se almacenan en `nodes[].cuts3d` en las coordenadas locales de esa instancia. Se conserva la compatibilidad de lectura con cortes antiguos tipo pincel, el historial de deshacer, los JSON exportables y la URL `?recover=1` para rescatar un borrador que no arranque. El recorte es de **superficies**, no produce automáticamente paredes interiores ni sólidos herméticos.

## v0.9.9 — Fase 1: espacio de trabajo con tres paneles

Reorganización exclusivamente visual de WILDTRAP. El motor, la cámara inicial, los modos de selección, el contenido de los JSON de escenarios, el almacenamiento del borrador y la lógica de las herramientas continúan intactos.

- **Barra superior:** Deshacer, Vaciar todo, Restaurar relieve original, Abrir mapa publicado, Exportar JSON e Importar JSON. Los botones originales se reubican, no se duplican.
- **Barra izquierda:** Vista/proyecto, Esculpir, Cuchillo, Estructuras y botón compacto Play. Mantener presionado Vista abre un menú pequeño de las vistas actuales; abrir Estructuras muestra sus opciones en Propiedades sin invocar de inmediato la galería.
- **Dock derecho:** tres paneles apilados con separadores de altura ajustable, pestañas que se pueden arrastrar entre paneles, y un borde izquierdo para cambiar el ancho del dock. La distribución personal se guarda en `wildtrap-workspace-ui-v1`, independiente de los datos de la escena.
- **Propiedades de herramienta:** las secciones originales de Proyecto, Esculpir, Cuchillo y Estructuras se muestran de manera contextual, sin cambiar identificadores de botones o campos.
- **Propiedades de objeto:** los campos originales de posición, rotación, altura y escala se muestran en la pestaña Objeto cuando hay selección. El botón de movimiento redundante desaparece de Esculpir, pero el modo interno sigue disponible.
- **Ventanas Objetos y Jerarquía:** reservadas para la Fase 2, cuando se conectarán a la escena con agrupación automática y exclusión de spawns y otros marcadores lógicos. La Fase 1 no crea un gestor ficticio ni altera las listas de objetos.
- **Pendientes de Fases 3 y 4:** gesto Alt + clic derecho de pincel, Ctrl+Z contextual por punto, catálogo GLB integrado en el dock, visualización transparente de vértices, bloqueo de vértices, anclaje de base y restricciones de rotación XYZ.

El módulo `editor-workspace.js` reorganiza los controles originales antes de que se importe `editor.mjs`; `editor-workspace.css` implementa la disposición. `tests/browser-workspace.mjs` valida el layout y los controles en Chrome. El modo Play oculta las barras para mantener la experiencia a pantalla completa, y el modo `?recover=1` conserva su panel de rescate.

## v0.9.10 — Fase 2: gestor real de objetos y jerarquía

La pestaña **Objetos** del dock derecho ahora enumera los objetos persistentes de `live.nodes`, con grupos desplegables por tipo: **Cuevas**, **Montañas**, **Piezas de cueva** y **Modelos colocados**. El gestor no muestra los elementos generados por lógica o solo marcadores: `tree`, `wallspawn`, `spawn`, `exit`, `anchor`, `path`, `wall`, `stairs` y `gate`. El contador corresponde únicamente a los modelos físicos de la escena; los cambios de colocación, duplicado, eliminación, importación, deshacer o reset se reflejan directamente.

- **Seleccionar:** clic en una fila selecciona la misma instancia que un clic en el escenario y muestra su pestaña de propiedades; Ctrl+clic permite selección múltiple y Shift+clic selecciona un rango dentro del grupo.
- **Visibilidad:** los iconos ◉/◌ de un modelo o de un grupo lo muestran u ocultan en el editor; los ocultos no se seleccionan desde el escenario. La operación es reversible con Deshacer. La fila especial **Escenario · Terreno** permite ocultar el relieve sin borrar sus alturas; el cuchillo deja de detectar la malla oculta, pero el modo Play puede volver a mostrarla temporalmente.
- **Grupos manuales:** selecciona dos o más objetos y pulsa **Agrupar**, asigna un nombre; Desagrupar devuelve los objetos a sus tipos automáticos. Los nombres individuales pueden cambiarse con **Renombrar**. Los grupos creados permanecen en la jerarquía y se guardan con el escenario.
- **Persistencia:** cada objeto puede tener los campos opcionales `name`, `editorHidden` y `groupId`; los grupos se guardan en `live.objectGroups`, y el ocultamiento del terreno en `live.settings.hideTerrainEditor`. Los mapas antiguos sin estos campos siguen cargando. Las operaciones usan el mismo `snapshot()`, `persist()` y Ctrl+Z del editor y se incluyen en el JSON exportado.
- **Interfaz:** las tres áreas redimensionables de la Fase 1 no cambian. La pestaña **Jerarquía** ahora resume las categorías y grupos existentes, y la pestaña **Objetos** administra las instancias.

Pruebas: `tests/scene-object-catalog.test.mjs` valida categorías y grupos sin Three.js; `tests/browser-scene-object-manager.mjs` comprueba en Chromium el listado de modelos, exclusión de spawns, selección múltiple, ojos de visibilidad (incluyendo terreno), deshacer, crear/deshacer grupos y renombrar. Las pruebas existentes de arranque, recuperación y espacio de trabajo siguen vigentes.

## v0.9.11 — Fase 3: controles de pincel, deshacer cronológico y catálogo acoplado

- **Esculpir:** mantén **Alt + botón derecho del ratón** y arrastra **horizontalmente** para ampliar/reducir el radio, o **verticalmente** para aumentar/reducir la intensidad (arriba aumenta). Los controles existentes `brushRadius` (1–65) y `strength` (1–30) se actualizan y se muestra un indicador flotante. El gesto no esculpe, no selecciona modelos ni orbita la cámara. Fuera de las herramientas de esculpir, el botón derecho conserva su comportamiento.
- **Deshacer:** el botón superior y **Ctrl+Z** usan un orden común de acciones. Mientras el cuchillo guarda puntos pendientes, cada clic es reversible; también se puede deshacer **el cierre** de un contorno sin borrar su último punto. Al aplicar un agujero, el historial del escenario deshace el corte completo. Si hubo una operación del escenario después de agregar un vértice pendiente, se deshace primero esa operación más reciente. El historial en memoria se reinicia al recargar, como antes.
- **Estructuras:** el catálogo real de los cuatro GLB ya no se abre como modal. Se aloja dentro de la pestaña **Propiedades → Estructuras** del dock derecho; ofrece las cinco perspectivas originales (3D, frente, lado, atrás y arriba), vista previa renderizada del propio modelo y colocación mediante clic. Puedes seguir usando el escenario mientras el catálogo esté desplegado, y la herramienta se muestra sin alterar la vista inicial.
- La lista de marcadores lógicos y estructuras antiguas continúa en la misma pestaña. Posición, escala y rotación de un modelo seleccionado siguen en **Objeto**, no en la lista permanente de herramientas.
- **Validación:** `tests/phase3-tool-controls-smoke.html` prueba en Chrome el ajuste del pincel en cuatro direcciones, la galería embebida, el deshacer de vértices/cierre y el orden cronológico entre acciones pendientes y operaciones del escenario. Los tests de GLB, cortes y recuperación siguen incluidos en las comprobaciones.

No incluye aún la Fase 4 (edición transparente de malla, bloqueo de vértices, anclaje y restricciones XYZ).

## v0.9.12 — Fase 4: edición de malla, Intangible y restricciones

La Fase 4 completa el rediseño del editor, conservando la interfaz de tres paneles, el catálogo, los recortes poligonales y los proyectos existentes.

### Intangible: referencias transparentes y no seleccionables

Junto al ojo **◉** de cada modelo persistente aparece **INT**. Actívalo para mostrar ese objeto como un fantasma semitransparente que se ve incluso a través del terreno, sin ocultarlo ni eliminarlo. La herramienta Cuchillo lo ignora, así como el picking, hover y la selección rectangular del escenario: el clic alcanza la superficie tangible situada detrás. Pulsa **INT** nuevamente para recuperar el comportamiento normal. El botón **INT** situado junto al ojo del grupo aplica la misma función a todos sus modelos. Oculto e Intangible son estados independientes y se guardan en el JSON; cambiar uno no desactiva el otro. Los objetos intangibles se vuelven sólidos solo mientras está activo el modo Play, pero la edición y el estado guardado no cambian.

### Ver malla 3D y bloquear vértices

Selecciona un **modelo GLB** desde el escenario o desde **Objetos** y pulsa **Malla** en la barra izquierda. La malla se vuelve translúcida; se muestran aristas verde-agua y vértices delanteros y traseros con profundidad desactivada. Haz clic en un punto o arrastra un rectángulo para seleccionar vértices (Ctrl añade o quita). Los vértices coincidentes en la geometría se seleccionan juntos.

- **Bloquear vértices:** conserva las posiciones de los vértices elegidos, incluso cuando después deformes el resto.
- **Desbloquear vértices:** devuelve esos puntos al conjunto deformable.
- **Deformar vértices libres:** elige X, Y, Z o XYZ y factor entre 0.1 y 5. Se deforma la copia de ese modelo, no el GLB compartido. Los bloqueos se conservan con la operación que se acaba de aplicar: futuros cambios en la selección no reescriben deformaciones previas.
- **Restaurar deformación:** reconstruye el modelo original sin borrar los bloqueos.

Con modelos GLB grandes se limita el número de puntos dibujados simultáneamente por rendimiento; **Seleccionar todos** sigue incluyendo todos sus vértices. Cuando una malla ya tiene recortes, el editor utiliza las posiciones e índices estables de su topología fuente para que el cuchillo y los bloqueos no se mezclen con los triángulos nuevos. No se altera la caché compartida de archivos GLB. El guardado se reconstruye tras abrir JSON y es compatible con mapas anteriores sin datos de edición. Los modelos procedimentales heredados (no GLB) no tienen edición de vértices en esta versión; sí admiten **Intangible**.

### Restringir rotaciones y anclar base

En la pestaña **Objeto** de un GLB seleccionado están los botones **X / Y / Z bloqueado**. Estos afectan a **Alt + arrastrar**: horizontal gira alrededor del eje Y cuando Y está libre, vertical inclina alrededor de X cuando X está libre, y si X/Y están bloqueados y Z está libre el movimiento horizontal gira sobre Z. Se guarda el estado por modelo. El inspector añade rotación Z numérica y un indicador de ejes ligado a la orientación de la cámara (X rojo, Y verde, Z azul).

**Anclar base Y al escalar:** fija la posición inferior del propio objeto tomada al comenzar el gesto, también con transformaciones numéricas. No depende de que el terreno esté al nivel global 0: si la base está en Y = 37, seguirá en esa posición durante el escalado. Dentro de la herramienta Malla, el mismo anclaje determina el pivote de las deformaciones de vértices libres.

El estado se guarda como campos opcionales `editorIntangible`, `rotationLocks`, `rotationZ`, `anchorScaleY`, `scaleAnchorOffsetY`, `vertexLocks` y `meshScaleOps` en los nodos, sin cambiar el formato anterior. Todo cambio aplicado utiliza el historial actual de Ctrl+Z.

Pruebas: `tests/mesh-deform.test.mjs` verifica vértices realmente deformados y la inmutabilidad del original; `tests/browser-phase4-mesh.mjs` recorre en Chrome la interfaz de Intangible, malla, bloqueo, escala, rotaciones, anclaje, restauración, Ctrl+Z y guardado; las regresiones de Fases 1–3, GLB, cuchillo y rescate siguen ejecutándose.
