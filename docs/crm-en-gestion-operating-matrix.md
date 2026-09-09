# CRM v2 — Matriz Operativa: En Gestión

## 1. Definición

Un Lead está **En Gestión** cuando ya existió contacto efectivo y hay una conversación comercial activa, pero la oportunidad todavía no pasó a Entrevista, Cierre, Seña o Venta.

El objetivo de la etapa no es completar tareas por sí mismas, sino **producir un avance comercial verificable** o dejar definido el próximo contacto que continuará la gestión.

El valor interno actual `en_proceso` se conserva durante esta primera iteración por compatibilidad y se presenta al usuario como **En gestión**.

## 2. Reglas de entrada y permanencia

1. Para ingresar o permanecer en En Gestión debe existir siempre un **próximo contacto futuro con fecha y hora**.
2. No existe la opción ni la sección operativa “Sin próximo contacto”.
3. El próximo contacto canónico sigue utilizando `lead_crm.next_contact_at`, `lead_crm.next_contact_note` y `next_contact_source = manual`; no se crea un segundo sistema de agenda.
4. La ficha del vendedor no muestra “Vendedor asignado”: el vendedor sólo gestiona su propia cartera y ese dato es redundante en esta superficie.
5. Si un seguimiento no obtiene respuesta, el Lead **permanece En Gestión**. El resultado se registra dentro del proceso de seguimiento de la etapa; no pasa a Sin contacto.
6. Toda modificación relevante debe conservar historial de fecha, hora, usuario y resultado.

## 3. Tarjeta antes de abrir el Lead

La tarjeta debe priorizar información accionable:

- Nombre del cliente.
- Modelo / versión de interés.
- Estado: En gestión.
- Próximo contacto: fecha y hora, con prioridad visual.
- Último contacto.
- Días en etapa.
- Avance orientativo del playbook.
- Próxima acción u objetivo del contacto.

### Orden

Los Leads activos se ordenan por `next_contact_at`:

1. Vencidos, del más antiguo al más reciente.
2. Hoy, del horario más próximo al más lejano.
3. Próximos días, cronológicamente.

No se ofrece una bandeja “Sin próximo contacto”. La ausencia de próximo contacto es una inconsistencia que debe impedirse al guardar, no una opción de trabajo válida.

## 4. Ficha de En Gestión

La ficha se organiza en cinco áreas:

### A. Contexto comercial

- Cliente.
- Teléfono / WhatsApp.
- Modelo / versión de interés.
- Origen.
- Días en etapa.
- Última interacción.
- Próximo contacto.

No mostrar vendedor asignado.

### B. Playbook comercial

#### Inicio

1. Enviar mensaje inicial.
2. Confirmar modelo / versión de interés.
3. Detectar necesidad principal.

#### Propuesta

4. Enviar presupuesto.
5. Enviar fotos del vehículo.
6. Enviar ficha técnica o comparativa cuando aporte valor.

#### Calificación

7. Definir modalidad de compra: Plan de Ahorro / Crédito / Contado.
8. Relevar anticipo o capacidad inicial.
9. Consultar usado en parte de pago.
10. Identificar plazo / urgencia de compra.

#### Avance

11. Detectar objeción principal.
12. **Definir y programar próximo contacto**: un único paso que combina objetivo comercial, fecha y hora del seguimiento.
13. Intentar llevar la oportunidad a Entrevista o Cierre cuando corresponda.

Los puntos del playbook son una guía operativa y una fuente de eventos; no deben transformarse por sí solos en una métrica de rendimiento del vendedor.

### C. Mensajes sugeridos

Las plantillas son ayudas editables, no mensajes obligatorios:

- Mensaje inicial.
- Seguimiento con presupuesto.
- Envío de fotos.
- Ficha técnica / comparativa.
- Reactivación suave.
- Invitación a entrevista / cierre suave.

### D. Material sugerido

El vendedor debe poder acceder desde el CRM al material existente del modelo y usarlo en la conversación:

- Generador de presupuesto existente.
- Fotos del vehículo.
- Ficha técnica PDF cuando exista.
- Comparativas / material de producto.
- Opciones de financiación.
- Promoción vigente cuando corresponda.
- Video del vehículo cuando exista material aprobado.

La primera versión reutiliza los assets y PDFs ya versionados en el repositorio. No se duplica almacenamiento.

### E. Historial

Registrar eventos estructurados además del texto libre:

- Cambio de estado.
- Próximo contacto programado o reprogramado.
- Mensaje/material utilizado.
- Presupuesto generado/enviado.
- Resultado de seguimiento.
- Elementos del playbook completados.
- Transición a una nueva etapa.

## 5. Próximo contacto / seguimiento

Al programar el próximo contacto se guarda:

- Fecha.
- Hora.
- Objetivo o motivo.
- Canal sugerido, cuando corresponda.
- Comentario opcional.

Motivos iniciales sugeridos:

- Retomar propuesta.
- Revisar presupuesto.
- Enviar / revisar material.
- Resolver financiación.
- Resolver objeción.
- Coordinar entrevista.
- Confirmar decisión.
- Otro.

Al ejecutar el contacto se registra el hecho observado, no una valoración subjetiva de desempeño:

- Respondió y continúa En Gestión.
- No respondió.
- Reprogramó.
- Pasó a Entrevista.
- Pasó a Cierre.
- Pasó a Seña.
- Pasó a Venta.
- Desistió.

## 6. Transiciones permitidas

Desde En Gestión:

- En Gestión → En Gestión, con nuevo seguimiento programado.
- En Gestión → Entrevista.
- En Gestión → Cierre.
- En Gestión → Seña.
- En Gestión → Venta.
- En Gestión → Desistir.

No se utiliza En Gestión → Sin contacto para un seguimiento que no respondió.

## 7. Métricas: superficie del supervisor

Estas métricas no se muestran como score al vendedor.

El panel del supervisor deberá poder calcular, entre otras:

- Leads que ingresaron a En Gestión.
- Leads que avanzaron desde En Gestión.
- **Gestiones que no avanzaron**.
- **Tasa de no avance**.
- Conversión En Gestión → Entrevista.
- Conversión En Gestión → Cierre.
- Conversión En Gestión → Seña.
- Conversión En Gestión → Venta.
- Tiempo promedio y mediano en En Gestión.
- Seguimientos realizados / vencidos.
- Reprogramaciones.

La definición temporal exacta de “Gestión que no avanzó” se validará con uso real antes de fijar umbrales automáticos, para evitar crear una nueva métrica susceptible a Goodhart.

## 8. Principios de implementación

- Reutilizar el sistema canónico de próximo contacto existente.
- Reutilizar el generador de presupuestos existente.
- Reutilizar fotos/PDFs existentes por modelo.
- Mantener trazabilidad completa.
- Persistir eventos del playbook de manera estructurada antes de utilizarlos en métricas.
- Mantener el desarrollo fuera de `main` hasta validación funcional y autorización explícita de merge.
