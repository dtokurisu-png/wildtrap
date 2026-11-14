# Publicación de escenarios a WildTrap Play

El editor local y el juego no comparten un borrador. **Nunca** edites `maps/current.json` de WildTrap Play manualmente mientras hay pruebas en curso.

## Publicar desde el editor

1. Abre WildTrap Editor (v0.9.40 o superior) y carga tu escenario de trabajo.
2. En **Vista y proyecto → Publicar mapa · WildTrap Play**, pulsa **Revisar mapa actual**.
3. Prepara un token **fine-grained** desde https://github.com/settings/personal-access-tokens/new
   - Resource owner: propietario del repositorio
   - Only select repositories: `dtokurisu-png/wildtrap-play`
   - Repository permissions → **Contents: Read and write**
   - Expiration: la más corta compatible con el trabajo
4. Copia ese token únicamente en el campo temporal del editor. No lo pegues en chats, commits, archivos JSON, capturas ni lo guardes en código.
5. Escribe las notas, marca la confirmación y pulsa **Publicar copia en WildTrap Play**.
6. Comprueba que el editor muestre el ID y el enlace al archivo histórico publicado.

El token se vacía del campo al publicar con éxito. Si falla la red o la autorización, ninguna versión se activa mientras la referencia `main` no cambie. Solo la API GitHub puede publicar: un sitio estático no puede escribir en un repositorio sin autorización.

## Qué se actualiza en Play

Un solo commit contiene los 3 archivos:

- `maps/versions/v...json`: versión inmutable
- `maps/current.json`: mapa para nuevas partidas
- `maps/manifest.json`: puntero activo e historial

El editor conserva su mapa y sus datos locales; la publicación no cambia el estado de edición ni abre el archivo del amigo.

## Regla para multijugador

La sala almacena `mapVersion` al crearse. Desde ese momento, **todos los jugadores cargan esa versión específica**; nunca `maps/current.json` durante una sesión activa.

## Recuperar una versión

En Play, conserva los archivos históricos y cambia `activeVersion`, `activePath` y `current.json` en un mismo commit si necesitas revertir. Una sesión ya creada continúa con su `mapVersion`.

## Recursos 3D

El JSON no incluye automáticamente los binarios GLB. WildTrap Play puede cargar modelos compartidos desde la ruta de assets del editor o distribuir una copia propia, según decida el responsable de Play.
