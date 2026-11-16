# Normas permanentes de interfaz — Wildtrap

Estas reglas se aplican a **toda herramienta, panel o función nueva** que se incorpore al editor y a futuras revisiones de su interfaz.

1. **Interfaz compacta por defecto.** Mostrar únicamente título identificable, controles imprescindibles y estado mínimo cuando sea necesario. No insertar párrafos tutoriales, notas extensas ni explicaciones permanentes dentro de paneles.
2. **Ayuda bajo demanda.** Poner las instrucciones en un botón pequeño «ⓘ» junto al título. Ese botón debe abrir un diálogo modal accesible, breve y cerrable, sin ocupar espacio cuando no se utiliza.
3. **Botones funcionales desde el primer clic.** El control principal de una herramienta debe iniciar su modo correspondiente, no quedar deshabilitado porque aún no se seleccionó algo. Si requiere selección, el primer clic activa dicha selección; otro clic confirma la operación. Ante una condición imposible, mostrar un mensaje breve y accionable.
4. **No romper flujos anteriores.** Al integrar controles, respetar estado, selección, navegación, modelos y guardado. No modificar otras secciones salvo que sea indispensable.
5. **Probar el flujo real.** Verificar al menos: primer clic sin selección, selección posterior, operación final, guardado, volver a editar y ayuda modal en navegador. Un test que solo habilita el modo por código no sustituye probar el botón visible.
6. **Evitar texto invasivo en futuras mejoras.** Mantener el panel limpio y consistente. La ayuda detallada solo aparece cuando el usuario la solicita.

Estas reglas deben consultarse antes de diseñar o modificar cualquier nueva interfaz de Wildtrap.
