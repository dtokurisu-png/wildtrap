# WILDTRAP — Biblioteca de cuevas y guaridas 3D (fase 1)

Estado: **fase 1 implementada**, pruebas automáticas correctas. Objetivo: construir pequeñas guaridas de jefes, no una red automática de mazmorras.

## Auditoría del editor anterior

- El editor de terreno `editor.mjs` conserva: elevación/nivelado/suavizado de la heightmap, selección, mover, rotación de módulos legacy, anclajes, rutas, compuertas, muros, spawns, importación de alturas, agujeros reales y JSON.
- El modo `Probar` en `playtest.mjs` sigue independiente.
- **Antes de esta fase**, las piezas se componían de cajas y cilindros. No había una biblioteca de seis mallas deformables por vértice; tampoco existía un exportador GLB ni un editor de vértices para prefabricados.
- Se ha integrado una categoría separada, **Estructuras / Cuevas**, sin sustituir el sistema de edición del terreno ni el conjunto de elementos previos.

## Módulos iniciales

| Tipo | Forma/topología | Interior |
|---|---|---|
| `floor` | Cuadrícula 12×12 de suelo horizontal; permite elevar sectores y bordes | Superficie única |
| `wall` | Muro con grosor, caras frontal/trasera, laterales y remates, todas subdivididas | Cara posterior separada |
| `vault` | Bóveda abierta de arco, superficie exterior e interior curvas con grosor entre ellas; sin extremos cerrados | Geometría interior real |
| `tunnel` | Bóveda de dos superficies más suelo con grosor, entrada y salida abiertas | Interior visible, sin DoubleSide |
| `ramp` | Plano inclinado subdividido, base inferior y costados | Superficie de marcha superior |
| `chamber` | Sala de perímetro irregular, suelo radial, paredes interior/exterior, remate superior y abertura frontal; **sin techo** | Sala transitable visualmente |

**Nota:** “transitable” se refiere a la **geometría prevista**. Todavía no se ha implementado la colisión real del personaje con estas piezas; corresponde a la fase 4.

La densidad de subdivisión de las piezas puede configurarse mediante `segmentsX`, `segmentsZ`, `segmentsArch` en el motor y se mantiene razonable. El editor expone de momento ancho, alto, largo, grosor, rotación, escala y posición vertical.

### Archivos

- `cave-pieces.mjs`: geometría procedural **independiente de Three.js**; posiciones, índices, UV, normales, grupos de materiales, parámetros, desplazamientos.
- `cave-pieces-three.mjs`: adaptación a `THREE.BufferGeometry`; malla real con `position`, `normal`, `uv`, `index`, grupos interior/exterior y materiales grises.
- `editor.mjs`: agrega y dibuja estas estructuras sin alterar el resto del terreno, mantiene la selección/movimiento/duplicación y guarda el nodo con su tipo y dimensiones.
- `tests/cave-pieces.test.mjs`: conjunto de pruebas Node para cada modelo.
- `.github/workflows/cave-pieces-tests.yml`: ejecuta pruebas con GitHub Actions al modificar la biblioteca.

### Deformación real y conservación

Las piezas **no son ilustraciones ni prefabricados inmutables**. Cada vértice tiene una posición tridimensional, y el módulo `deformCavePieceData(data, center, radius, delta)` deforma una región con caída suave.

Los cambios quedan registrados como `vertexEdits`, un mapa `índice de vértice → [dx,dy,dz]`. El generador regenera el objeto original a partir de su topología paramétrica y vuelve a aplicar esos desplazamientos, con recalculo de normales.

El formato de nodos es:

```json
{
  "kind": "cavePiece", "piece": "tunnel", "id": 17,
  "x": 25, "z": -18, "offsetY": -3,
  "width": 12, "height": 8, "length": 20,
  "thickness": 1.25, "rotation": 0, "scale": 1,
  "vertexEdits": {"9": [0, 0.5, 0]}
}
```

El guardado JSON existente preserva estos datos. Cambiar las **dimensiones** conserva los índices de vértices mientras se mantenga el mismo número de subdivisiones. Este editor no implementa aún el pincel visual de selección/deformación **sobre la pieza** (fase 2).

## Fases siguientes (no implementadas)

**Fase 2:** conectar el pincel existente para deformación directa sobre piezas seleccionadas con raycast de malla, ejes y deshacer; conectar módulos vecinos mediante extremos y posición/orientación.

**Fase 3:** exportar GLB correctamente (normal, UV, materiales, dimensiones y `vertexEdits` horneados), así como importar los GLB ya estilizados. Validar con un lector externo. Conservar siempre un JSON editable.

**Fase 4:** normales y materiales provisionales, colisiones simplificadas independientes de las mallas visuales, pruebas de tránsito, conexiones y materiales interior/exterior. Ya hay materiales grises y UV preliminares en fase 1, pero no son un pipeline final de texturización.

No se implementó generación automática de laberintos, pisos ni navegación compleja.

## Cómo probar la fase 1

1. Abrir la página de WILDTRAP, activar **Vista 3D** si es necesario.
2. En **Estructuras / Cuevas**, elegir una de las seis piezas y pulsar **Colocar pieza**.
3. Hacer clic en el escenario; usar **Seleccionar** o **Mover**.
4. Cambiar anchura, longitud, altura, grosor, escala, rotación y desplazamiento Y con **Aplicar dimensiones**; usar **Duplicar** para otra instancia independiente.
5. Exportar JSON e importarlo de nuevo; comprobar que los nodos `kind: "cavePiece"` se conservan. La deformación por vértice está probada internamente, pero el pincel directo aún no está habilitado.
6. Consultar la validación automática en la pestaña Actions del repo.
