# WILDTRAP — Propuesta de evento: Guardián de los Ecos

**Estado:** Propuesta de diseño guardada para desarrollo futuro. **No implementar todavía.**  
**Fecha:** 10 de noviembre de 2026  
**Prioridad actual:** continuar creando los personajes y criaturas del mundo de WILDTRAP.  
**Alcance:** evento excepcional de expedición, NO una mecánica que deba ocurrir en cada partida.

## 1. Idea central

WILDTRAP sigue siendo un juego de explorar una jungla, capturar criaturas, recoger huevos y conseguir recursos. El **Guardián de los Ecos** introduce, ocasionalmente, un acontecimiento especial de engaño y combate cooperativo.

**No existe un traidor humano predeterminado.** El guardián altera la percepción de los jugadores y crea Ecos que parecen compañeros reales. Todos intentan jugar y progresar; el conflicto surge de ilusiones, desapariciones visuales selectivas y ataques dirigidos a objetivos difíciles de identificar.

La regla narrativa es: **la jungla miente; los jugadores no necesitan traicionarse voluntariamente**.

## 2. Activación: tomar un huevo

- **Cualquiera de los jugadores** presentes en la expedición puede provocar el evento al **recoger o tomar un huevo**.
- La aparición no es obligatoria ni debe ocurrir en todas las partidas. Puede existir una condición o probabilidad especial asociada a determinados huevos, zonas, nidos o circunstancias; **la regla exacta está pendiente de decidirse**.
- El acto de tomar el huevo sirve como detonante narrativo: el guardián protege o reclama aquello que los jugadores se están llevando de la jungla.
- No asignar por defecto un jugador traidor, culpable ni «impostor» secreto. El jugador que desencadena el evento no tiene por qué actuar contra los demás.
- Si se utiliza una advertencia o manifestación del guardián antes de la niebla, servirá para anticipar la amenaza y dar una oportunidad de reacción; esta fase introductoria todavía no tiene reglas definitivas.

## 3. Manifestación del Guardián y la Niebla de los Ecos

Cuando se activa el evento:

1. Se presenta una **señal audiovisual clara** de que ha comenzado la ilusión y que los Ecos pueden aparecer (cambio de niebla, energía, sonido o marca mágica).
2. **La jungla / el área entra en un estado de embrujo temporal**, en vez de asignar toda la mecánica únicamente a un jugador.
3. Cada jugador puede recibir una **visión ligeramente diferente** de la escena: ciertos compañeros se ven normalmente, otros pueden desaparecer temporalmente y algunos Ecos están visibles de forma diferente según el observador.
4. El efecto es **ocasional y temporal**. No debe sustituir el bucle principal del juego ni hacer permanentemente confusa una expedición.

La señal de inicio debe ser inequívoca, pero **no debe identificar cuál figura es un jugador real y cuál es un Eco**.

## 4. Ecos: copias enlazadas a controles reales

El Eco es una copia visual asociada a un jugador auténtico. **No aprende a imitar sus movimientos con retraso ni trata de adivinarlos.** Debe **recibir o reproducir el mismo estado/orden de animación** de su jugador de referencia.

Ejemplo:

- B pulsa **saltar** → B y su Eco saltan **en el mismo momento**.
- B se **agacha**, hace un **gesto**, usa una **animación** o un **sticker/emote** → ambos ejecutan la acción correspondiente simultáneamente.
- B intenta demostrar su identidad saltando frente a A → el Eco vinculado a B ejecuta exactamente el mismo salto. Esa prueba deja de servir para distinguirlos.

**Separación imprescindible de sistemas:**

| Sincronizado con el jugador original | Independiente y controlado por el Eco |
| --- | --- |
| Estado de salto o agacharse | Posición, desplazamiento y trayectoria |
| Gestos, emotes, stickers y poses | Elección de objetivo y persecución |
| Animaciones de acciones visuales | Robo de objetos, huevos y recursos |
| Cambios de estado de animación relevantes | Decisión de atacar, escapar y ocultarse |

**No** compartir directamente las coordenadas, física, colisiones ni el disparo efectivo del jugador entre ambas entidades. Un Eco puede mostrar una animación de ataque sincronizada sin que eso dispare automáticamente el arma del jugador. El combate real de los Ecos tiene lógica independiente.

## 5. Ilusiones sobre jugadores reales

El guardián **también puede aplicar al jugador auténtico una apariencia ilusoria similar a la del Eco**, para que ambos parezcan igualmente sospechosos.

- La presencia del efecto mágico confirma que hay ilusiones activas; **no revela la identidad del Eco**.
- Un observador puede ver a la vez a B y a su Eco; otro puede ver solamente al Eco mientras el verdadero B es invisible para él por un intervalo.
- Los cambios de visibilidad **son por observador**, no desapariciones físicas globales: el personaje verdadero continúa existiendo y actuando para el servidor.
- En una misma situación, varios jugadores pueden estar observando versiones distintas de la escena.

**Ejemplo de confusión deseada:** B anuncia «soy el que está saltando». A ve a B y a su Eco saltando exactamente a la vez. C puede dejar de ver al B auténtico y observar únicamente la copia. Nadie puede identificar de manera fiable al verdadero únicamente a través de un gesto.

## 6. Combate, derribos y motivación para atacar

No basta con esperar a que pase el embrujo: el evento debe impulsar a los jugadores a **buscar, combatir y derrotar Ecos**.

- Los Ecos **pueden atacar a jugadores, intentar robar recursos y huir**.
- Al derrotar a un Eco, este libera una **esencia**.
- Las esencias conseguidas por cualquiera se suman a una **reserva compartida del equipo**.
- Al llegar a una cantidad requerida, **se rompe la ilusión** y se resuelve el evento. El número concreto de esencias está pendiente de balanceo.
- Los Ecos pueden ocupar posiciones delante o junto a un jugador real para provocar disparos dudosos y errores de identificación.
- **Durante el estado de niebla**, un golpe válido de otro jugador podría **derribar inmediatamente a un compañero**, **no eliminarlo definitivamente**. El tiempo de recuperación y la posibilidad de reanimación quedan por diseñar.

La confusión visual no debe causar daño arbitrario: **las colisiones, la identidad real del objetivo y los resultados de ataques deben resolverse por el sistema de juego/servidor**, aunque cada cliente vea una ilusión diferente.

El límite temporal y las consecuencias del fracaso (por ejemplo, pérdida limitada de botín recuperable) siguen siendo **propuestas a equilibrar**, no reglas aprobadas.

## 7. Situaciones emergentes que buscamos

- Un jugador persigue a un Eco que parece un compañero; el Eco lo conduce cerca de otro jugador real.
- La copia parece ejecutar el mismo salto o gesto que el jugador original porque ambos comparten las órdenes de animación.
- Un jugador dispara para recuperar un recurso robado y, por una mala identificación o mala línea de tiro, derriba accidentalmente a su compañero.
- Los integrantes de un equipo discuten qué figura es auténtica porque **no todos están viendo a las mismas personas ni a los mismos Ecos**.
- Un Eco roba un huevo, se aleja y obliga al equipo a perseguirlo para conseguir la esencia y recuperar el botín.

El objetivo es que estas situaciones creen historias memorables **dentro de una expedición cuyo propósito principal sigue siendo capturar criaturas**.

## 8. Alcance reducido para respetar la meta de desarrollo

No convertir esta idea en un clon de Among Us, un sistema de traidores permanentes, una inteligencia artificial social compleja ni una mecánica obligatoria por partida.

Al retomarla, priorizar un prototipo pequeño:

1. Activador ocasional vinculado a recoger un huevo.
2. Manifestación visible del guardián y estado de niebla.
3. Un conjunto pequeño de Ecos sincronizados con las **órdenes de animación** de sus jugadores de referencia.
4. Percepciones/visibilidad individuales para demostrar las ilusiones.
5. Comportamiento simple del Eco: perseguir, atacar, robar, huir.
6. Esencias compartidas para finalizar el evento.
7. Comprobación de impactos y derribos entre compañeros bajo reglas consistentes.

**Pendiente para otra conversación:** diseñar el aspecto físico del guardián, el diseño visual de los Ecos, el huevo/nido desencadenante, la frecuencia de aparición, recompensas, número de copias y cantidades de esencia.

## 9. Decisiones preservadas y estado

**Aprobadas como dirección de diseño:**
- Evento **eventual y ocasional**, no presente en todas las partidas.
- Posible detonante: **cualquier jugador al tomar un huevo**.
- El embrujo afecta la percepción del escenario y puede variar entre observadores.
- Ecos que **comparten en tiempo real los estados de animación** del jugador original; no usan imitación retardada.
- Movimiento y ataques reales de cada Eco independientes.
- Los jugadores verdaderos también pueden verse ilusorios.
- Los jugadores deben luchar contra Ecos para obtener **esencias compartidas** y disipar la ilusión.
- Posibilidad de **derribo accidental** entre compañeros, no muerte permanente automática.

**No decidido:**
- Condición exacta del huevo que invoca al guardián; probabilidad y frecuencia.
- Número de jugadores, Ecos simultáneos y duración del embrujo.
- Si el guardián puede ser ahuyentado antes de desplegar la niebla.
- Reglas definitivas para chat/voz, recompensas, derribos y recuperación.

**Estado de implementación:** documento de propuesta únicamente. **No modificar todavía el código jugable ni iniciar esta mecánica. Continuar primero con los personajes del mundo.**
