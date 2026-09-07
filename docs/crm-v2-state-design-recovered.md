# CRM v2 — Diseño de estados recuperado

> Documento de recuperación. Reúne únicamente decisiones que pudieron reconstruirse de conversaciones, documentación previa y comportamiento actual del CRM. Cuando el detalle original no pudo recuperarse de forma literal, se marca como **pendiente de recuperar/validar** en vez de inferirlo.

## 1. Principios transversales confirmados

- El **estado comercial** describe la situación real de la oportunidad.
- Las **tareas/playbooks** viven dentro de cada etapa y ayudan a ejecutar la gestión; completar checks no equivale por sí solo a avance comercial.
- Deben medirse dos cosas por separado: ejecución del seguimiento y avance comercial real.
- Debe existir **una única próxima acción canónica**, no agendas paralelas.
- El historial conserva: cambios de estado, fecha/hora, actor, tareas, reprogramaciones, mensajes/materiales, transferencias, intentos y resultados.
- No existe una opción operativa normal “Sin próximo contacto” para En Gestión, Entrevista, Cierre o Seña.
- En Gestión, Entrevista, Cierre y Seña mantienen tareas y verificación de avance y requieren seguimiento/próximo contacto.
- “Pide contacto futuro” sólo aplica antes de que exista una gestión comercial activa: puede originarse desde Nuevo o Sin contacto; no se usa dentro de En Gestión, Entrevista, Cierre o Seña.
- Si un cliente deja de responder después de haber entrado en una etapa comercial activa, no se lo devuelve automáticamente a Sin contacto.
- Estados terminales o de cierre operativo cancelan tareas automáticas pendientes para evitar acciones huérfanas.
- Las métricas de estancamiento/avance pertenecen al Supervisor; no deben transformarse en un ranking de checks visible al vendedor.

## 2. Nuevo

### Definición operativa recuperada
Lead todavía sin resultado del primer contacto humano.

### UX aprobada
Pregunta principal:

**¿Pudiste contactar al cliente?**

- `Contestó`
- `No contestó`

Si `Contestó`:
- Pide contacto futuro
- En gestión
- Entrevista
- Cierre
- Seña
- Venta
- Desistir

Si `No contestó`:
- Sin contacto
- Dato erróneo / Inválido

La lógica evita pedir primero un estado abstracto: se registra el hecho objetivo “hubo contacto / no hubo contacto” y luego el resultado.

## 3. Sin contacto

### Origen
- Nuevo → Sin contacto
- Pide contacto futuro → Sin contacto cuando llega el contacto acordado, se intenta y no responde.

### Objetivo
Obtener contacto efectivo mediante protocolo predefinido.

### Protocolo recuperado
- Franja 10–12: 2 llamadas.
- Franja 14–16: 2 llamadas.
- Franja 17–19: 2 llamadas.
- WhatsApp integrado a la secuencia.
- Repetición/configuración por días según protocolo vigente.

### Auditoría
Registrar, cuando sea posible:
- hora real de la acción;
- hora declarada si la integración no conoce la hora real;
- hora en que se marcó/registró la acción;
- resultado.

El objetivo inicial es observar comportamiento real, no penalizar automáticamente.

### Resultado
Si responde:
- Pide contacto futuro
- En gestión
- Entrevista
- Cierre
- Seña
- Venta
- Desistir

Si no responde:
- continúa Sin contacto mientras el protocolo esté vigente;
- protocolo completo sin contacto efectivo → Base fría;
- protocolo incompleto → permanece visible como protocolo incumplido.

## 4. Pide contacto futuro

### Definición aprobada
Hubo contacto efectivo, todavía no comenzó una gestión comercial y el cliente solicitó explícitamente ser contactado posteriormente.

### Puede originarse desde
- Nuevo
- Sin contacto

### Regla clave
Una vez que la conversación ya está En Gestión, Entrevista, Cierre o Seña, un contacto futuro es simplemente el próximo seguimiento de esa etapa; no se cambia a Pide contacto futuro.

### Al llegar la fecha/hora
Si responde:
- puede permanecer Pide contacto futuro si vuelve a postergar antes de iniciar una conversación comercial;
- o avanzar a En gestión / Entrevista / Cierre / Seña / Venta / Desistir.

Si se intenta y no responde:
- Pide contacto futuro → Sin contacto y comienza/retoma el protocolo.

Si vence sin que el vendedor actúe:
- permanece Pide contacto futuro;
- queda marcado como contacto solicitado vencido.

Si reprograma:
- se conserva la fecha/hora anterior en historial como reprogramada.

## 5. Base fría

### Naturaleza
Cartera de recuperación, no etapa comercial normal.

### Entrada
Sólo cuando el protocolo completo de Sin contacto terminó sin contacto efectivo.

No ingresar por mero paso del tiempo.

### Al ingresar
- mensaje automático no final;
- queda disponible para recuperación posterior, promociones, nuevos modelos, cambios de precio, IA/reactivación.

La semántica final de reapertura/reactivación quedó pendiente de una definición posterior.

## 6. En gestión

La matriz detallada está en `docs/crm-en-gestion-operating-matrix.md`.

### Definición
Contacto efectivo y conversación comercial activa, sin haber llegado todavía a Entrevista, Cierre, Seña o Venta.

### Reglas confirmadas
- Próximo contacto obligatorio con fecha/hora.
- No mostrar “Vendedor asignado” en la ficha del vendedor.
- No existe “Sin próximo contacto”.
- Si un seguimiento no responde, permanece En gestión.
- El playbook guía la gestión y genera eventos; no es un score de rendimiento.

### Playbook aprobado
**Inicio**
1. Enviar mensaje inicial.
2. Confirmar modelo / versión.
3. Detectar necesidad principal.

**Propuesta**
4. Enviar presupuesto.
5. Enviar fotos.
6. Ficha técnica / comparativa si aporta valor.

**Calificación**
7. Modalidad de compra.
8. Anticipo / capacidad inicial.
9. Usado en parte de pago.
10. Plazo / urgencia.

**Avance**
11. Objeción principal.
12. Definir y programar próximo contacto.
13. Intentar llevar a Entrevista o Cierre.

### Transiciones confirmadas
- En gestión → En gestión
- Entrevista
- Cierre
- Seña
- Venta
- Desistir

No usar En gestión → Sin contacto por falta de respuesta en un seguimiento.

## 7. Entrevista

### Decisiones recuperadas
- Es una etapa comercial propia con tareas/playbook y verificación de avance.
- Tiene seguimiento/próximo contacto obligatorio.
- “Pide contacto futuro” no aplica dentro de la etapa.
- El CRM actual ya modela `interview_at` y `interview_location` y exige fecha/hora de entrevista al cambiar a Entrevista.

### Divergencia actual detectada
El formulario actual no exige `next_contact_at` para `entrevista`, mientras la regla de diseño recuperada establece seguimiento/próximo contacto obligatorio también en Entrevista.

### Transiciones recuperadas
- Cierre → Entrevista está explícitamente permitido.
- Seña → Entrevista está explícitamente permitido.

### Pendiente de recuperar/validar
No se recuperó con suficiente fidelidad el listado final de campos ni el playbook específico de Entrevista, ni todas sus transiciones de salida. No deben inventarse en implementación irreversible.

## 8. Cierre

### Decisiones recuperadas
- Etapa comercial propia con tareas/playbook y seguimiento obligatorio.
- Representa una instancia posterior a la construcción de la propuesta: la propuesta ya fue entendida y el cliente está en decisión, objeción o compromiso.
- “Pide contacto futuro” no aplica dentro de Cierre.
- Si un seguimiento no responde, permanece Cierre y se registra el resultado.
- Cierre → Entrevista está permitido.

### Comportamiento actual encontrado
El código existente obliga próximo contacto y eleva Cierre a prioridad alta mediante su lógica actual.

### Pendiente de recuperar/validar
No se recuperó con fidelidad suficiente el playbook final, campos específicos y todas las transiciones de Cierre.

## 9. Seña

### Decisiones recuperadas
- Etapa comercial propia con tareas/playbook y seguimiento obligatorio.
- “Pide contacto futuro” no aplica dentro de Seña.
- Seña → Entrevista está explícitamente permitido.

### Comportamiento actual encontrado
- El CRM actual exige `deposit_amount > 0` para ingresar/guardar Seña.
- También exige próxima acción futura.

### Pendiente de recuperar/validar
No se recuperó con fidelidad suficiente el playbook final de Seña ni todas sus transiciones. La relación Seña → Cierre había quedado sin resolución clara en el contexto disponible.

## 10. Venta

### Recuperado
- Es terminal para el embudo de adquisición.
- Las tareas automáticas de seguimiento pendientes deben cancelarse al quedar Venta.
- El circuito administrativo/postventa es separado del funnel comercial.
- El CRM actual mantiene confirmación de venta y minuta/circuito administrativo aparte.

### Pendiente
Detalle final de UX de la ficha terminal de Venta dentro de esta matriz v2.

## 11. Inválido / Dato erróneo

### Recuperado
- Es terminal para el ciclo actual.
- Requiere motivo obligatorio.
- Al quedar terminal no deben persistir tareas operativas automáticas pendientes.
- El formulario actual solicita explicar por qué el teléfono/contacto es inválido.

### Pendiente
Regla final de reapertura/corrección y catálogo definitivo de motivos.

## 12. Desistir

### Recuperado
- Es terminal para la oportunidad/ciclo actual.
- Requiere motivo obligatorio.
- No deben quedar tareas automáticas pendientes.
- La implementación actual lo deriva a base de remarketing/recuperación.

### Pendiente
Semántica final de una futura reaparición del cliente y catálogo definitivo de motivos. La intención previa era preservar el desistimiento histórico si el cliente vuelve, no borrar el ciclo anterior.

## 13. Transferencias

Excepción recuperada:
- una oportunidad En gestión reasignada a otro vendedor puede presentarse operativamente al receptor como una nueva asignación/ciclo `Nuevo`, conservando íntegro el historial anterior;
- quedó pendiente decidir si esto será una semántica de base de datos o sólo una presentación/experiencia del receptor.

## 14. Próxima acción canónica e historial

La arquitectura recuperada separa:

1. **Estado actual**: situación comercial real.
2. **Próxima acción**: qué debe ocurrir y cuándo.
3. **Historial**: qué ocurrió realmente.

Eventos que deben poder persistirse:
- transición de estado;
- creación/completado/incumplimiento/reprogramación de tarea;
- actor;
- mensaje/material utilizado;
- fecha/hora solicitada por cliente;
- hora de acción y hora de registro;
- transferencia anterior/nuevo vendedor y motivo;
- intentos del protocolo y resultado.

## 15. Métricas de supervisión recuperadas

Especialmente para En Gestión:
- ingresaron a En Gestión;
- avanzaron desde En Gestión;
- Gestión que no avanzó;
- tasa de no avance;
- En Gestión → Entrevista;
- En Gestión → Cierre;
- En Gestión → Seña;
- En Gestión → Venta;
- tiempo promedio/mediano en etapa;
- seguimientos realizados/vencidos;
- reprogramaciones.

La definición temporal exacta de “Gestión que no avanzó” debe observarse antes de fijar umbrales automáticos para evitar Goodhart.

## 16. Estado de la UI/UX al retomar este trabajo

La etapa de definición de campos había concluido y el trabajo estaba pasando a jerarquía e interacción de pantalla.

Para En Gestión se había establecido como base:
- cabecera del lead sin vendedor asignado;
- próximo contacto como bloque visual dominante;
- playbook comercial en cuatro grupos;
- mensajes sugeridos editables/copiar/usar;
- material sugerido del vehículo dentro del CRM;
- resumen/contexto comercial;
- tabs Gestión, Historial, Consultas anteriores y Conversación IA;
- métricas de estancamiento fuera de la superficie del vendedor.

La siguiente tarea es implementar esta experiencia reutilizando el CRM actual y su próxima acción canónica, sin crear un segundo sistema de agenda.