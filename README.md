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
