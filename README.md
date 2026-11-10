# WILDTRAP · Prototipo 3D v0.2

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
- **WASD / flechas**: desplazarse.
- **Shift**: correr, produce ruido y aumenta alerta.
- **E**: interactuar con nidos, recursos, faros, nota, sello y mochila.
- **Espacio**: ahuyentar temporalmente a una criatura cercana.
- **X**: extraer cuando se está cerca del campamento y se lleva al menos un huevo.
- **R**: reconstruir misma semilla.
- **Nueva expedición**: regenerar la distribución usando el valor del campo Semilla.

El mapa fijo mide 240×240 unidades, con campamento y cuatro sectores. La semilla modifica árboles, nidos, recursos, fauna, patrullas y dos objetivos alternos. Robar al menos un huevo es el objetivo central.

## Farolera
El juego incluye solamente una **cápsula técnica provisional**. Usa **Cargar Farolera GLB** para seleccionar tu propio archivo `.glb`. El modelo no está incorporado al repositorio porque la ruta y los derechos del archivo original aún no se verificaron en los repositorios de R.O.K. Si el GLB falla, el HUD lo indica sin bloquear la partida. Los demás elementos son geometría provisional.

## Pruebas
`node test-world.mjs`

El generador ha superado 250 semillas en una prueba de lógica (repetibilidad, presencia de nidos y faros, objetivos), pero la escena 3D **no se ha ejecutado de punta a punta en un navegador en esta sesión**, por lo que aún puede requerir ajustes de rendering, controles y rendimiento.

## Solucionar «Preparando la expedición»
La versión anterior importaba Three.js a través de esm.sh sin controlar el error previo a la ejecución del módulo, por lo que podía quedar congelada en la pantalla de carga. La v0.2 usa un import map con CDN jsDelivr, captura errores de módulo y muestra un mensaje y botón de reintento si la inicialización no concluye en doce segundos.

La dependencia Three.js se descarga por internet en el navegador; si una red bloquea la CDN, aparecerá el diagnóstico correspondiente. En ese caso, la solución de producción será integrar una copia vendorizada o un bundle local, no ocultar el problema.

## Próximas fases
1. Confirmar funcionamiento real desde GitHub Pages y cargar Farolera GLB.
2. Mejorar colisiones, navegación de fauna, percepción y manadas.
3. Agregar sistema de Guardianes e incubación.
4. Implementar salas cooperativas de 1 a 4 jugadores con servidor autoritativo y persistencia de botín.
5. Integrar intercambios y tienda únicamente después de validar el backend.

**No usar el guardado en localStorage para producción, pagos o intercambio.**
