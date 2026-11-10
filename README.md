# WILDTRAP · Prototipo 3D v0.3

Juego cooperativo de expediciones y búsqueda de huevos de Guardianes. **Esta versión es exclusivamente una prueba individual**, sin servidor, comercio ni Guardianes funcionales todavía.

## Archivos
- `index.html`: interfaz y diagnóstico de carga (12 segundos máximo).
- `main.mjs`: escena Three.js, movimiento, enemigos, nidos, botín, extracción, HUD y opción de cargar un GLB.
- `world.mjs`: generador por semilla, sin dependencias del navegador.
- `test-world.mjs`: pruebas automatizadas del generador.
- `.nojekyll`: publicación estática sin procesamiento Jekyll.

## Abrir con GitHub Pages
1. Abrir el repositorio y entrar a **Settings → Pages**.
2. En **Build and deployment**, elegir **Deploy from a branch**.
3. En **Branch**, elegir **main**, carpeta **/(root)** y **Save**.
4. La dirección esperada, una vez publicada y confirmada por GitHub, será `https://dtokurisu-png.github.io/wildtrap/`. No asumir que funciona antes de que Pages confirme el deployment.

No hace falta PowerShell una vez activado GitHub Pages. Por usar importaciones ESM y archivos locales, no abrir `index.html` mediante `file://` (doble clic).

## Controles de teclado
- **WASD / flechas**: desplazarse según la orientación de cámara.
- **Arrastrar el ratón sobre el escenario**: girar la cámara cercana sobre el hombro.
- **Shift**: correr, produce ruido y aumenta alerta.
- **E**: interactuar con nidos, recursos, faros, nota, sello y mochila.
- **Espacio**: ahuyentar temporalmente a una criatura cercana.
- **X**: extraer al encontrar la **cueva de salida activa** y llevar un huevo. También sirve **E** junto a esa cueva.
- **R**: reconstruir misma semilla.
- **Nueva expedición**: regenerar la distribución usando el valor del campo Semilla.

El mapa mide **420×420 unidades**. Tiene **cinco regiones** y un refugio fijo en la esquina sureste. Cada expedición asigna aleatoriamente los cinco biomas (pradera, bosque denso, bosque antiguo, humedales y montaña) a estas regiones, con relieve propio, caminos principales, accesos secundarios con escaleras, barreras naturales y compuertas. Cinco cuevas se distribuyen en las regiones; solo una es la extracción activa de la expedición. La semilla cambia vegetación, fauna, nidos, recursos y objetivos. Robar al menos un huevo es la misión principal.

## Farolera
El juego incluye solamente una **cápsula técnica provisional**. Usa **Cargar Farolera GLB** para seleccionar tu propio archivo `.glb`. El modelo no está incorporado al repositorio porque la ruta y los derechos del archivo original aún no se verificaron en los repositorios de R.O.K. Si el GLB falla, el HUD lo indica sin bloquear la partida. Los demás elementos son geometría provisional.

## Pruebas
`node test-world.mjs`

El generador ha superado **1.000 semillas** en pruebas de lógica (repetibilidad, cinco biomas sin repetir, cinco nidos, cinco cuevas y una extracción, accesos principales, despeje de corredores), pero la escena 3D **no se ha ejecutado de punta a punta en un navegador en esta sesión**, por lo que aún puede requerir ajustes de rendering, controles y rendimiento.

## Solucionar «Preparando la expedición»
La versión anterior importaba Three.js a través de esm.sh sin controlar el error previo a la ejecución del módulo, por lo que podía quedar congelada en la pantalla de carga. La v0.3 usa un import map con CDN jsDelivr, captura errores de módulo y muestra un mensaje y botón de reintento si la inicialización no concluye en doce segundos.

La dependencia Three.js se descarga por internet en el navegador; si una red bloquea la CDN, aparecerá el diagnóstico correspondiente. En ese caso, la solución de producción será integrar una copia vendorizada o un bundle local, no ocultar el problema.

## Próximas fases
1. Confirmar funcionamiento real desde GitHub Pages y cargar Farolera GLB.
2. Mejorar colisiones, navegación de fauna, percepción y manadas.
3. Agregar sistema de Guardianes e incubación.
4. Implementar salas cooperativas de 1 a 4 jugadores con servidor autoritativo y persistencia de botín.
5. Integrar intercambios y tienda únicamente después de validar el backend.

**No usar el guardado en localStorage para producción, pagos o intercambio.**

## Cambios de v0.3 (10 noviembre 2026)
- Cámara tercera persona sobre hombro con arrastre para orientar, terreno elevado y cámara ajustada al suelo.
- Refugio de reaparición siempre en la esquina inferior derecha (sureste).
- Cinco regiones que intercambian biomas por semilla, incluyendo la montaña, manteniendo la conectividad base.
- Barreras de roca y arboleda densa con colisión, accesos alternativos, compuertas interactivas y escaleras.
- Cinco cuevas, con una de salida aleatoria; el campamento no es ya el destino de extracción.
- La Farolera sigue siendo GLB opcional, sin assets externos inventados. El resto permanece geométrico.
- Advertencia: el relieve y los obstáculos están en fase de prototipo. La navegación no utiliza todavía navmesh ni colisiones físicas completas; hay que validar los accesos en el navegador y ajustar las geometrías a la escala del modelo real.
