# WILDTRAP — Hoja de desarrollo: expediciones, biomas, recolección y contratos

**Actualizado:** 10 de noviembre de 2026.  
**Naturaleza del documento:** especificación de diseño / backlog para implementar posteriormente; **no equivale a funciones ya programadas**.  
**Alcance de esta actualización:** todas las decisiones y propuestas surgidas después del registro del [Guardián de los Ecos](PROPUESTA_GUARDIAN_DE_LOS_ECOS.md). Ese evento permanece en su propio documento, sin duplicarlo ni modificarlo.

> **Principio principal:** WILDTRAP es un juego de expediciones cooperativas para capturar criaturas, recuperar huevos, conseguir materiales y regresar a la base. Las misiones dan un objetivo concreto; la exploración, las criaturas, el botín y la cooperación dan motivos para desviarse del camino. Meta de producción: priorizar sistemas reutilizables para terminar el juego en aproximadamente tres meses, evitando complejidad innecesaria.

## 1. Estado de decisiones

- **Dirección acordada:** cinco biomas; recolección de flora, minerales y materiales de criaturas; guardianes útiles para extraer; herramientas físicas con espacio y escasez; fabricación e intercambio; expediciones con contrato aleatorio; objetivos principales, secundarios y extraordinarios; almacenamiento, venta y preparación para futuras partidas.
- **Catálogos de diseño inicial propuestos:** 15 recursos de entorno, 10 objetos fabricables, 15 contratos y diez tipos de árboles (cinco comunes, tres poco comunes y dos raros). Los nombres, ingredientes, cifras y probabilidades de estos catálogos son **provisionales y ajustables**; sirven como punto de partida para crear assets, no como implementación confirmada.
- **Pendiente:** distribución exacta de biomas y apariciones, capacidades de criaturas definitivas, balance, slots, precios, cantidades y tabla de botín. No crear aún sistemas extensos de hambre, supervivencia, economía o IA.
- **Fauna inicial:** por ahora, el lobo de cuatro orejas es el único animal que se planea introducir inmediatamente. Sapo del pantano, criatura de arena, excavador/armadillo, chivo embestidor y otras especies mencionadas son **ejemplos para el bestiario futuro**, no modelos ya aprobados ni implementados.

## 2. Biomas: exactamente cinco

| Bioma | Identidad y materiales | Posibles condiciones |
| --- | --- | --- |
| **Bosque** | Fusiona el bosque exuberante y el bosque de árboles antiguos en **un solo bioma**; árboles altos, frutos, savia, hojas, raíces | Exploración y recolección inicial; sin penalización ambiental obligatoria |
| **Pantano** | Raíces sumergidas, hongos, lodos, esporas; futuros materiales de fauna tóxica | Envenenamiento o toxinas en zonas concretas |
| **Desierto** | Arena y acantilados rocosos, cactus, minerales, flores resistentes; futura criatura que se desplaza bajo la arena | Calor / exposición solar; bebidas y protección contra calor |
| **Llanura** | Praderas, hierbas, fibras, rocío y vegetación de baja altura | Espacios abiertos, búsqueda y rastreo |
| **Cuevas** | **Bioma propio subterráneo**, distinto de lo que crece en superficie; hongos, musgos, cristales, huevos y guaridas | Oscuridad, rutas y depósitos especiales |

**No añadir un sexto bioma «Bosque Ancestral»**: forma parte del Bosque. No implantar una barra general y permanente de hambre para todos los personajes. Se prefieren **estados ambientales puntuales** (calor del desierto, toxinas del pantano) que den valor a prepararse, fabricar y explorar.

Las cuevas pueden construirse con las piezas modulares del editor de escenarios, pero los contenidos jugables (materiales, encuentros, colisiones, IA) son desarrollo posterior.

## 3. Recolección: descubrir ≠ extraer ≠ recoger

Los materiales no aparecen como una lista de objetos que cualquiera obtiene pulsando un único botón. **Cada nodo de recurso debe proponer un gesto de extracción reconocible**:

1. **Descubrir / rastrear:** localizar el árbol, fruto, veta, raíz enterrada o animal apropiado; el rastreador ayuda a detectar, pero no extrae automáticamente.
2. **Acceder:** alcanzar el depósito, proteger al recolector, colocarse y usar la capacidad correcta.
3. **Extraer:** atacar el fruto para derribarlo, cortar una planta, golpear el tronco, excavar una raíz, romper roca, raspar musgo o recolectar líquido con recipiente.
4. **Recoger:** el objeto materializado entra al inventario de quien lo recoge, o se distribuye por intercambio explícito; evitar que el mero descubrimiento dé el objeto.
5. **Decidir destino:** consumir/fabricar en la expedición, compartir, guardar al extraerse o vender.

### 3.1. Seis interacciones técnicas reutilizables

- **Cortar:** hoja, hierba, fibra, pulpa de cactus (arma de filo o herramienta).
- **Golpear / romper / sacudir:** roca, veta, árbol frutal o resina liberada por impacto (herramienta o guardián con impacto/embestida).
- **Disparar / alcanzar:** fruto o flor colgante / en saliente (arma de alcance o guardián volador).
- **Excavar:** raíz y otros depósitos enterrados (pala o guardián excavador).
- **Recolectar delicadamente:** rocío, lodo, esporas o savia (recipiente específico; no se obtiene con golpes).
- **Raspar / desprender:** musgo y hongos adheridos a paredes (raspador o herramienta compatible / guardián apropiado).

Son **seis tipos de interacción**, no seis sistemas completos de recolección distintos para cada recurso. Se implementan una vez y se reutilizan con distintas mallas, efectos y tablas de botín. La rareza modifica descubrimiento, accesibilidad, requerimientos y cantidad; no exige inventar otra mecánica.

### 3.2. Árboles: diez tipos en el mundo

- **5 especies comunes**, **3 poco comunes** y **2 raras**. Esta es una distribución por categoría, **no** una probabilidad fija ni una exigencia de que aparezcan todas en una partida.
- El primer objetivo de arte puede ser **cinco árboles base**, variando siluetas, escala, materiales y formas. El catálogo final propuesto de diez especies puede construirse de forma gradual sin modelar diez sistemas independientes.
- Ejemplos de siluetas: ceiba selvática, palmera de frutos, mangle retorcido, árbol de espinas y roble arcano. **No se han cerrado todavía las otras cinco especies ni su asignación de rareza**.
- Un árbol raro puede no generarse en una expedición; por ello **solo** debe convertirse en requisito secundario / oportunidad rara, salvo que el contrato principal garantice su aparición y la posibilidad de extracción.
- Ejemplo: un fruto elevado se derriba por disparo, guardián volador o sacudida mediante embestida; las rutas alternativas necesitan sus propias restricciones / consumo.

## 4. Materiales iniciales del entorno (15; catálogo propuesto)

| Bioma | Material | Rareza inicial | Extracción |
| --- | --- | --- | --- |
| Bosque | Hoja sanadora | Común | Cortar planta |
| Bosque | Fruto de copa | Poco común | Disparo, volador o sacudir árbol |
| Bosque | Savia espesa | Poco común | Golpear tronco / extracción adecuada |
| Pantano | Raíz purgante | Poco común | Excavación |
| Pantano | Espora somnífera | Común | Recipiente recolector |
| Pantano | Lodo absorbente | Común | Recipiente en depósito especial |
| Desierto | Pulpa de cactus | Común | Cortar cactus |
| Desierto | Mineral solar | Poco común | Romper veta con herramienta/guardián de impacto |
| Desierto | Flor crepuscular | Raro | Alcance a salientes con volador u otro acceso válido |
| Llanura | Hierba de vigor | Común | Cortar hierba |
| Llanura | Fibra trenzable | Común | Cortar y separar tallos |
| Llanura | Rocío claro | Común | Recipiente en flores/deposito |
| Cuevas | Hongo reparador | Poco común | Desprender de pared con alcance |
| Cuevas | Cristal cavernario | Raro | Romper veta resistente |
| Cuevas | Musgo umbrío | Poco común | Raspar pared |

La categoría de rareza no debe equivaler automáticamente al valor, poder o probabilidad final: habrá ajuste después del prototipo.

### 4.1. Recursos de animales y guardianes

Los **animales también entregarán materiales de fabricación**, no solo plantas, árboles y minerales. Pueden ser pieles, caparazones, venenos, glándulas, escamas, plumas o secreciones, según su diseño definitivo.

- Ejemplos futuros: **veneno de un sapo de pantano**; **partes de la criatura que se desplaza bajo la arena**.
- Cada criatura puede ofrecer materiales comunes y/o raros, obtenidos por combate, captura, actividad especializada u otra interacción que se defina para esa especie.
- **No hay que decidir todas las criaturas ahora.** Diseñar el sistema de recetas para que acepte en el futuro ingredientes tanto de entorno como de criaturas, sin reescribirlo.
- La composición y lista de materiales zoológicos se ampliará a medida que se diseñen personajes del mundo.

## 5. Fabricación y alquimia: hasta diez consumibles / utilidades iniciales

| # | Objeto | Ingredientes de partida (provisionales) | Función |
| --- | --- | --- | --- |
| 1 | Poción curativa | Hoja sanadora + Rocío claro | Recuperar vida |
| 2 | Poción curativa superior | Hoja sanadora + Hongo reparador + Rocío claro | Recuperación mayor |
| 3 | Antídoto | Raíz purgante + Rocío claro | Quitar veneno / toxinas |
| 4 | Bebida refrescante | Pulpa de cactus + Rocío claro | Reducir/eliminar calor acumulado |
| 5 | Ungüento termorresistente | Pulpa de cactus + Flor crepuscular | Retardar acumulación de calor |
| 6 | Tónico de vigor | Hierba de vigor + Fruto de copa | Restaurar energía / facilitar carrera |
| 7 | Trampa adhesiva | Savia espesa + Fibra trenzable | Inmovilizar temporalmente una criatura |
| 8 | Cebo sedante | Fruto de copa + Espora somnífera | Atraer y reducir capacidad de reacción |
| 9 | Linterna mineral | Cristal cavernario + Musgo umbrío | Alumbrar cuevas / descubrir señales |
| 10 | Revestimiento defensivo | Lodo absorbente + Mineral solar | Protección temporal |

**Reglas de producto:** reutilizar efectos simples (vida, energía, estados alterados, calor, trampas, defensa, visibilidad); no crear diez subsistemas. Las recetas se podrán **revisar y enriquecer con materiales animales** cuando se construya el bestiario. El mismo ingrediente puede tener múltiples usos: gastar ahora o reservar.

**Fabricar durante la expedición** sirve para resolver necesidades inmediatas; **fabricar en la base** sirve para preparar futuras expediciones. Los excedentes se pueden vender. Los objetos fabricados/preparados se llevan en un espacio limitado de la mochila.

## 6. Herramientas físicas, escasez y cooperación (regla nueva)

**Acuerdo central:** las capacidades de los guardianes y las **herramientas que lleva cada usuario** son dos vías de extracción complementarias. Ninguna herramienta debe ser gratuita, invisible, disponible para todos simultáneamente ni de capacidad infinita por defecto.

### 6.1. Equipamiento y capacidad

- **Cada jugador elige antes de salir qué herramientas lleva.** Ocupan **casillas o capacidad real de inventario/equipo**. La mochila también debe servir para medicinas, consumibles, recursos, huevos y otros hallazgos.
- No dar a todos los jugadores un kit completo de pico + pala + filo + recipientes + dispositivos especializados. Llevar más herramientas implica **dejar menos espacio para botín o consumibles**.
- Las herramientas **pueden prestarse/intercambiarse** entre compañeros; una sola herramienta puede servir a todo el equipo, si comparten ubicación y tiempo.
- La herramienta es una alternativa accesible a un guardián con esa capacidad, **pero** un guardián adecuado puede ahorrar espacio, permitir accesos especiales o mejorar eficiencia. No se debe bloquear permanentemente la recolección tras una criatura rara.
- Opciones básicas a prototipar: **herramienta de corte**, **pico/mazo de impacto**, **pala**, **recipiente de extracción**, **raspador**. El **arma de alcance** existente puede utilizarse para derribar frutos, sin obligar a crear otra herramienta especial.
- Las habilidades de un guardián pueden reemplazar o complementar estas funciones: volador (alcance), armadillo excavador (raíces), chivo embestidor (árboles/rocas), detector (rastrear, no extracción). **Son roles sugeridos, no compromisos de personajes modelados**.

### 6.2. Fabricar herramientas dentro de una partida: posible, pero excepcional

- Se podrá fabricar una herramienta de reposición durante la expedición **si se consiguen los materiales correctos y se cumplen las condiciones de fabricación**.
- **Debe costar bastante más esfuerzo que salir preparado**. Los materiales necesarios para fabricar herramientas desde cero serán escasos en cada mapa y competirán con recetas, contratos, mejoras o espacio de inventario.
- **No** distribuir cantidades suficientes para que cada jugador del grupo pueda fabricar un pico, una pala y todo el conjunto de extracción en cada partida.
- El objetivo es que los jugadores **busquen esos materiales juntos, decidan si vale la pena gastar los componentes y se presten la herramienta creada** para extraer recursos para el equipo.
- La herramienta de emergencia es una **solución de respaldo**, no una sustitución gratuita de la preparación previa. No añadir una fuente ilimitada de materiales de herramienta mediante regeneración rápida.
- Las recetas de herramientas (minerales, fibras, piezas animales, estaciones, coste de materiales y desgaste) **no están cerradas**; definirlas tras probar inventario, rendimiento y distribución de recursos.

### 6.3. Compatibilidad con las misiones principales

Hay una distinción fundamental entre **escasez para cooperar** e **imposibilidad arbitraria**:

- Al generar un **objetivo principal obligatorio**, el juego debe asegurar que los nodos, criaturas y materiales requeridos puedan aparecer en cantidad suficiente.
- La capacidad de extracción correspondiente debe ser **viable para ese equipo**: por equipo preparado, por guardianes, o por una ruta alternativa de creación/obtención factible en la expedición.
- Si nadie trae pico ni guardián de impacto y no existe forma viable de conseguirlo, **no asignar como contrato principal una extracción que exija ese pico**. Esto puede validarse al seleccionar el contrato antes de comenzar o mediante reglas explícitas de carga mínima.
- **No** multiplicar artificialmente los materiales raros para entregar herramientas a todos: garantizar **al menos una solución viable compartida** es suficiente; el resto puede seguir escaso.
- Los objetivos **secundarios** sí pueden requerir un recurso raro que no aparece o una capacidad que el grupo no tiene. Son oportunidades opcionales, **sin penalización** por no completarlos.
- La solución recomendada es **validación del contrato contra generación y capacidades del equipo**, no regalar herramientas mágicas ni reducir el precio de fabricación.

### 6.4. Ejemplo del pico compartido

1. El equipo entra preparado con una pala y un recipiente, **pero sin pico**.
2. Detecta una veta de mineral solar. No basta acercarse y recogerlo.
3. Un integrante encuentra una cantidad escasa de componentes para crear **un pico de emergencia**; construirlo consume recursos valiosos.
4. El equipo fabrica **un** pico, acuerda quién lo usa y se reúne en la veta.
5. El usuario con pico rompe el depósito; los compañeros protegen al recolector y reciben/materiales mediante el sistema de distribución/intercambio.
6. El equipo debe decidir si conserva el pico para la siguiente veta o si prefiere emplear materiales y espacio en otras actividades.

Las cifras de coste, resistencia y slots quedarán sujetas a balance. **No implementar aún desgaste o reparación compleja** salvo que la prueba indique que son imprescindibles.

## 7. Contratos y misiones aleatorias de expedición

### 7.1. Cuándo y cómo aparecen

- Cuando un jugador crea un equipo y **la partida va a comenzar**, se presenta **una misión/contrato aleatorio**, visible a todos.
- Habrá un catálogo de **15 misiones iniciales**, construido con tipos de objetivos reutilizables (recolectar, extraer, cazar/obtener material, rastrear, recuperar un huevo).
- La selección puede depender de biomas generados, criaturas disponibles y equipo/capacidades. Es aleatoria **entre opciones válidas**, no necesariamente entre los 15 contratos sin condiciones.
- **Objetivo principal:** dificultad **media-alta**; es la condición base para cobrar el contrato. Debe ser realmente posible en la partida, con oportunidades suficientes, sin regalar la victoria.
- **Objetivos secundarios:** múltiples y **opcionales**. Pueden ser imposibles en alguna semilla debido a que no apareció un árbol raro, una criatura o un recurso. No penalizan el principal; ofrecen recompensas adicionales si surgen y se completan.
- **Objetivo extraordinario:** entrar en una guarida/cueva de jefe y **obtener un huevo de jefe**. Cualquier huevo de jefe válido da una recompensa superior; el **huevo del jefe exacto solicitado** da una **recompensa mucho mayor y posibles objetos raros**.
- Si el jefe solicitado **no aparece** en esa expedición, la recompensa máxima específica será inalcanzable, **pero un huevo de otro jefe sigue siendo válido** para la recompensa extraordinaria estándar.
- Al traer un huevo, el jugador puede **conservarlo para su colección** o **entregarlo a cambio de recompensas**. No se cobra la entrega consumiendo el huevo y a la vez conservando otra copia por defecto.

### 7.2. Catálogo de 15 misiones (objetivos base, nombres provisionales)

| Bioma | Contrato | Objetivo principal |
| --- | --- | --- |
| Bosque | 1. Reserva medicinal | Hojas sanadoras y rocío claro |
| Bosque | 2. Frutos de la copa | Derribar y recuperar frutos altos |
| Bosque | 3. Rastros del bosque | Materiales de fauna forestal futura |
| Pantano | 4. Veneno del pantano | Obtener veneno de sapos futuros |
| Pantano | 5. Raíces profundas | Desenterrar raíces purgantes |
| Pantano | 6. Esporas peligrosas | Recuperar esporas de hongos |
| Desierto | 7. Cazador subterráneo | Partes de la futura criatura que se mueve bajo arena |
| Desierto | 8. Reserva del desierto | Pulpa de cactus y minerales solares |
| Desierto | 9. Bajo el sol | Recuperar materiales en sectores de alto calor |
| Llanura | 10. Suministros del campamento | Hierbas de vigor y fibras |
| Llanura | 11. Rastreo abierto | Materiales de fauna futura de la llanura |
| Llanura | 12. La cosecha perdida | Recuperar recursos dispersos |
| Cuevas | 13. Cristales profundos | Extraer cristales cavernarios |
| Cuevas | 14. Hongos de la oscuridad | Hongos reparadores y musgo umbrío |
| Cuevas | 15. Ecos de las profundidades | Materiales de criaturas cavernícolas futuras |

**No activar contratos con criaturas no diseñadas todavía.** Inicialmente ofrecer solo los compatibles con el contenido real y agregar los restantes conforme crezcan los biomas y el bestiario.

Las **cantidades del objetivo principal** podrán escalar de forma prudente con la cantidad de participantes. Los secundarios pueden solicitar: fruta de árbol raro, materiales de otro bioma, una especie de aparición poco común, etc. Evitar que una misión obligatoria dependa al azar de una aparición rara no garantizada.

### 7.3. Resultado y recompensas

- Cumplir el principal: recompensa base del contrato.
- Cumplir secundarios: recompensas **extra**, acumulables; no son requisitos.
- Cumplir el extraordinario con **cualquier** huevo de jefe válido: bono significativo.
- Entregar el **huevo específico** solicitado: bono excepcional y posible material raro.
- Completar varias categorías en una misma expedición puede generar un conjunto de recompensas muy valioso.
- Si falla el principal, se recomienda **no borrar automáticamente el botín recogido**. Queda sujeto a reglas de extracción y riesgo: si consiguen regresar, conservan los objetos recuperables, aunque no cobren el objetivo principal.
- **Pago del contrato al equipo**, y propiedad de huevos/materiales individuales o distribución explícita a definir para evitar apropiaciones injustas. No asignar automáticamente la propiedad sin una regla de reparto acordada.

## 8. Inventario, intercambio, almacén, fabricación y tienda

**En expedición:**
- Mochila limitada para herramientas, consumibles, materiales y huevos.
- Intercambio directo entre aliados, especialmente para prestar una herramienta de extracción o reunir ingredientes para una receta.
- Fabricación básica sobre la marcha para medicinas, bebidas y trampas; herramientas de emergencia excepcionalmente y a alto coste.
- Materiales valiosos deben motivar decidir entre gastar, transportar, compartir y arriesgar.

**Al regresar con extracción exitosa:**
- Guardar materiales, huevos y objetos conservados en el **almacén/base**.
- Fabricar objetos y preparar el equipamiento de la próxima partida.
- Entregar materiales o huevos para contratos a cambio de moneda/recompensas, o **guardarlos** para fabricar/coleccionar.
- Vender excedentes para comprar provisiones.

**Tienda inicial (tres artículos):** poción curativa, bebida refrescante y trampa adhesiva. Comprar ahorra tiempo; fabricar puede ahorrar moneda, pero requiere localizar, extraer y transportar ingredientes. Precios aún sin decidir.

## 9. Guardianes y progresión por colección de huevos

- La razón para capturar nuevos guardianes **no** se limita a acumular modelos o aumentar daño: cada criatura puede tener función en combate, exploración y extracción.
- Algunas pueden alcanzar recursos inaccesibles mediante herramientas corrientes o mejorar la eficiencia del equipo.
- Las capacidades de exploración/recolección se diseñan como **etiquetas reutilizables** (volar, cavar, embestir, rastrear, etc.), para evitar código exclusivo por cada recurso.
- Existirán guardianes con **habilidades definitivas raras y especialmente poderosas** que motiven buscar huevos cada vez más difíciles.
- Equilibrio deseado: raros ofrecen nuevas oportunidades y definitivas importantes, pero un guardián común especializado conserva utilidad. La rareza no debe invalidar automáticamente a todos los anteriores.
- El huevo capturado puede representar una inversión a largo plazo; entregarlo a cambio de un premio del contrato implica renunciar a esa oportunidad.
- Se incorporarán materiales de criaturas a recetas y contratos conforme se definan las nuevas especies.

## 10. Bucle del juego y prioridades de producción

**Bucle central:**

`Formar equipo → seleccionar equipamiento y guardianes → recibir contrato aleatorio viable → explorar biomas → combatir, encontrar, extraer, compartir, fabricar y capturar → decidir si arriesgarse por secundarios/huevo de jefe → extraerse → cobrar, almacenar, vender, fabricar → próxima expedición`.

**Prioridad de implementación reducida** (propuesta, sin empezar aún):

1. **Datos y reglas:** biomas, nodos de recursos, identificadores, tipos de extracción, catálogo de recetas, herramientas, equipo y contratos definidos en archivos de datos; separar contenido de lógica.
2. **Primer corte jugable:** un contrato principal válido + unos pocos secundarios; una o dos formas de extracción, una herramienta que ocupa slot, un guardián como alternativa, una o dos recetas útiles, intercambio y vuelta a base.
3. **Ampliación modular:** añadir recursos y herramientas sin reescribir interacciones; luego activar hasta 15 contratos y 10 consumibles según fauna y escenarios que ya estén terminados.
4. **Progresión y recompensas:** almacén, tienda inicial, misiones de huevo, rarezas y bonos extraordinarios.
5. **Balance y pruebas:** comprobar que el principal es realizable, los secundarios pueden faltar sin castigo, los materiales de herramientas siguen siendo escasos y que cooperar es útil sin bloquear siempre a grupos pequeños.

**Fuera de alcance por ahora:** hambre permanente, economía sofisticada, desgaste complejo, cientos de recetas, IA social avanzada, generación masiva de mazmorras y nueva lógica específica para cada árbol/criatura.

## 11. Relación con otros documentos y estado real del repositorio

- [Guardián de los Ecos](PROPUESTA_GUARDIAN_DE_LOS_ECOS.md): **evento ocasional** desencadenable potencialmente cuando cualquier jugador toma un huevo. No ocurre en todas las partidas. Permanece como propuesta separada; el sistema de contratos no obliga a activarlo.
- [Biblioteca de cuevas fase 1](CAVE_LIBRARY_PHASE1.md): estructura geométrica del editor; no supone que las mecánicas de bioma, objetos, guardianes o contratos estén implementadas.
- El repositorio principal aloja actualmente **el editor de escenarios**. Esta hoja documenta el futuro desarrollo jugable. **Guardar esta hoja no añade personajes, herramientas, misiones ni inventarios al ejecutable actual.**

### Pendientes antes de programar

- Definir número real de slots/peso y de guardianes equipables.
- Definir recetas exactas y coste escaso de creación de herramientas dentro de partida; posible taller/mesa portátil y qué materiales iniciales existen realmente.
- Precisar si hay herramientas reutilizables sin desgaste y qué excepciones existen.
- Determinar reglas de inventario, reparto, propiedad, pérdida y recuperación de botín.
- Establecer algoritmo de validación `contrato principal ↔ biomas/nodos ↔ capacidades del equipo`.
- Definir recompensas y probabilidades, incluidas las especies raras de árboles y huevos de jefe.
- Incorporar gradualmente las especies animales, sus materiales y sus capacidades recolectoras.

**Registro:** conserva expresamente las decisiones de esta conversación para retomarlas al seguir creando los personajes del mundo. Nada de esta hoja autoriza implementar automáticamente las características aún pendientes.
