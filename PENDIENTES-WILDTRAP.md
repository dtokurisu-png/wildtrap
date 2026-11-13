# WILDTRAP — Pendientes del editor procedural

Última actualización: 12 de noviembre de 2026.

## Estado del plan principal
- [x] **Fase 1 — Creador de zonas:** zonas poligonales lógicas, selección, edición y guardado.
- [x] **Fase 2 — Acantilados:** subregiones vinculadas a zonas y selección de caras de la malla.
- [x] **Fase 3 — Texturizado:** biblioteca de materiales para cinco biomas, cinco ranuras por bioma.
- [x] **Fase 4 — Aplicación y mezcla:** aplicación por zonas, mezcla y proyección de texturas para acantilados.
- [x] **Fase 5 — Generador procedural de biomas:** semillas reproducibles, reglas, compatibilidad y bloqueos.

**Nota:** Las fases 1 a 5 están integradas en código hasta v0.9.27. No equivale a una aprobación de las pruebas visuales o de integración en navegador. No borrar ni sobrescribir los escenarios guardados por el usuario.

## Pendientes prioritarios

### Fase 6 — Definir biosistema
- [ ] Crear un catálogo ambiental de modelos 3D (árboles, plantas, criaturas, enemigos y decoración).
- [ ] Permitir asignar cada modelo a uno o varios de los cinco biomas.
- [ ] Distinguir categorías, modelos permitidos y configuración asociada.
- [ ] Registrar las definiciones en el JSON del proyecto sin colocar los modelos todavía.
- [ ] Respetar modelos y herramientas existentes.

### Fase 7 — Distribución procedural de modelos
- [ ] Distribuir modelos automáticamente dentro de las zonas según su bioma.
- [ ] Configurar densidad, elevación, inclinación máxima/mínima, separación y áreas de exclusión.
- [ ] Evitar superposiciones y colisiones.
- [ ] Utilizar semillas reproducibles; permitir regenerar conservando elementos o ubicaciones bloqueadas.
- [ ] Guardar la distribución y ofrecer Deshacer sin destruir colocaciones manuales.

### Fase 8 — Spawns y enemigos
- [ ] Crear/editar puntos de aparición fijos e independientes de la generación del bioma.
- [ ] Seleccionar enemigos válidos según el bioma que ocupe cada zona.
- [ ] Mantener la posición del spawn aunque se regenere el bioma.
- [ ] Definir reglas y parámetros de aparición para pruebas dentro del juego.
- [ ] Integrar con modo Probar sin bloquear el arranque del editor.

## Revisión final después de las ocho fases
- [ ] Validar el arranque real del editor en Chrome y las pruebas de GitHub Actions.
- [ ] Comprobar guardado automático, recuperación de borradores, exportación e importación JSON.
- [ ] Revisar visualmente texturas base, variaciones, transiciones y proyección sobre acantilados.
- [ ] Evaluar rendimiento con muchos modelos, gestión de memoria y carga/descarga de GLB.
- [ ] Comprobar colisiones, agujeros, cuchillo, edición de vértices y estabilidad de la malla.
- [ ] Probar modo Probar, Farolera y animación #40 de R.O.K. sin comprometer el editor.
- [ ] Verificar cámara, controles X/Y/Z, vista 3D predeterminada y persistencia de última cámara.
- [ ] Preservar escenario actual, zonas, recortes, texturas, objetos y configuraciones existentes.
- [ ] Confirmar funcionamiento real en el navegador antes de marcar el proyecto como terminado.

## Orden para continuar
**6 → 7 → 8 → pruebas finales.**

La implementación debe realizarse en el repositorio `dtokurisu-png/wildtrap` sin cambios destructivos sobre los borradores del usuario.
