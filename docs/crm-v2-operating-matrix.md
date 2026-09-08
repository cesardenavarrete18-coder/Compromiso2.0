# CRM V2 — Matriz Operativa Consolidada

> Documento de autoridad funcional para el rediseño del flujo comercial del vendedor.
>
> Rama de trabajo: `feat/crm-en-gestion-playbook`.
>
> Principio rector: medir y guiar el **proceso comercial real** y no optimizar únicamente el cumplimiento administrativo de tareas. Las tareas siguen existiendo donde aportan valor, pero no son por sí mismas la medida del trabajo comercial.

## 1. Principios generales

1. El vendedor debe registrar **qué ocurrió** con el Lead; el CRM deriva el estado y el proceso aplicable.
2. Los estados no forman una escalera estrictamente lineal. Cada estado tiene un conjunto explícito de transiciones comercialmente válidas.
3. El historial nunca se reescribe: todo cambio de estado, contacto, reprogramación, transferencia, reactivación, seña, venta o desistimiento debe conservar trazabilidad.
4. Un Lead transferido o reactivado comienza un **nuevo ciclo desde Nuevo**, conservando el historial completo del ciclo previo.
5. El vendedor no debe tener una salida operativa “Sin próximo contacto” en estados que requieren seguimiento. La ausencia de próximo contacto es una inconsistencia, no una bandeja válida.
6. El playbook es una guía de ejecución y una fuente de eventos; no debe convertirse automáticamente en un score de rendimiento susceptible a Goodhart.
7. Las métricas de desempeño y avance pertenecen principalmente a Supervisión; la superficie del vendedor debe priorizar qué hacer, con quién y por qué.

---

## 2. Estados y clasificaciones

Estados comerciales / operativos principales:

- `Nuevo`
- `Sin contacto`
- `Pide contacto futuro`
- `En gestión`
- `Entrevista`
- `Cierre`
- `Seña`
- `Venta`
- `Desistir`
- `Inválido / Dato erróneo`

`Base fría` **no es un estado comercial independiente**. Es una clasificación/segmento de oportunidades que terminaron en `Desistir` por no haber podido ser contactadas luego de completar el protocolo correspondiente.

---

# 3. NUEVO

## Significado

Lead recién ingresado o nuevo ciclo iniciado por transferencia/reactivación.

## Objetivo

Obtener el primer resultado real de gestión.

## Primera decisión de UI

**¿Contestó?**

- `Contestó`
- `No contestó`

### Si Contestó

Resultados posibles:

- `Pide contacto futuro`
- `En gestión`
- `Entrevista`
- `Cierre`
- `Seña`
- `Venta`
- `Desistir`

`Contestó` es un evento/resultado, no un estado persistente.

### Si No contestó

Resultados posibles:

- `Sin contacto`
- `Inválido / Dato erróneo`

## Regla

Nuevo puede saltar estados hacia adelante cuando la realidad comercial lo justifique. El CRM no debe obligar a simular etapas que no ocurrieron.

---

# 4. PIDE CONTACTO FUTURO

## Significado

Hubo contacto efectivo con la persona, todavía no comenzó una gestión comercial real y el cliente solicitó explícitamente ser contactado posteriormente.

Puede originarse desde:

- `Nuevo`
- `Sin contacto`, si finalmente responde pero pide que lo contacten en otro momento antes de iniciar la gestión comercial.

## Datos requeridos

- fecha;
- hora;
- contexto/comentario opcional;
- historial de reprogramaciones.

## Resultado al ejecutar el contacto

- responde y comienza conversación → estado comercial correspondiente;
- vuelve a pedir otro horario → permanece `Pide contacto futuro` con nueva fecha/hora;
- no responde → `Sin contacto` y se activa el protocolo;
- desiste explícitamente → `Desistir`.

## Vencimiento

Si llega el horario y el vendedor no ejecutó el contacto, permanece en `Pide contacto futuro` con condición de vencido. No se debe afirmar que el cliente “no respondió” si el contacto nunca se realizó.

---

# 5. SIN CONTACTO

## Significado

Lead actualmente sometido al protocolo inicial de contacto porque no respondió.

Puede originarse desde:

- `Nuevo`;
- `Pide contacto futuro` cuando llega el contacto solicitado, se intenta efectivamente y el cliente no responde.

No se utiliza como destino desde `En gestión`, `Entrevista`, `Cierre` o `Seña`.

## Protocolo base

Franjas previstas:

- 10:00–12:00;
- 14:00–16:00;
- 17:00–19:00.

El protocolo canónico comienza en la primera franja comercial disponible desde el ingreso y recorre nueve franjas efectivas consecutivas. Cada franja contiene dos llamadas: 18 llamadas en total. Un inicio parcial puede distribuir las nueve franjas sobre tres o cuatro fechas operativas.

No se crean tareas en el pasado: si la franja actual continúa vigente se utiliza desde la hora de ingreso; si terminó, se avanza a la siguiente franja de un día hábil según el calendario existente. La UI deriva las jornadas de las fechas efectivamente programadas y no fuerza tres fechas calendario.

## Datos que deben conservarse por intento

- fecha;
- hora exacta del intento / acción;
- hora de registro cuando aplique;
- franja;
- vendedor;
- canal;
- resultado.

La finalidad es conocer no sólo “cuántos intentos” se marcaron sino **cuándo se realizaron dentro de cada franja**.

## Si finalmente responde

Se cancela el protocolo y el Lead puede pasar a:

- `Pide contacto futuro`;
- `En gestión`;
- `Entrevista`;
- `Cierre`;
- `Seña`;
- `Venta`;
- `Desistir`.

## Fin de protocolo sin contacto

Cuando se completa correctamente el protocolo sin obtener respuesta:

- estado comercial → `Desistir`;
- motivo/clasificación → `No contactado post protocolo`;
- segmento → `Base fría`;
- se dispara el mensaje automático de cierre/puerta abierta definido para ese proceso.

Si el protocolo está incompleto, el Lead **no** debe limpiarse automáticamente por paso del tiempo: permanece visible como incumplimiento del protocolo.

---

# 6. EN GESTIÓN

## Significado

Ya existió contacto efectivo y hay una conversación comercial activa.

## Objetivo

Construir la operación y producir un avance comercial verificable o dejar definido el próximo contacto que continuará la gestión.

## Regla de permanencia

Mientras permanezca En Gestión debe existir próximo contacto con **fecha y hora**.

No existe “Sin próximo contacto” como opción válida.

Si un seguimiento no obtiene respuesta, el Lead **permanece En Gestión**; no vuelve a `Sin contacto`.

## Playbook

### Inicio

- Enviar mensaje inicial.
- Confirmar modelo / versión de interés.
- Detectar necesidad principal.

### Propuesta

- Enviar presupuesto.
- Enviar fotos del vehículo.
- Enviar ficha técnica o comparativa cuando aporte valor.

### Calificación

- Definir modalidad de compra.
- Relevar anticipo o capacidad inicial.
- Consultar usado en parte de pago.
- Identificar plazo / urgencia de compra.

### Avance

- Detectar objeción principal.
- **Definir y programar próximo contacto** como una sola acción: objetivo + fecha + hora.
- Intentar llevar la oportunidad a `Entrevista` o `Cierre` cuando corresponda.

## Herramientas asociadas

- plantillas de mensajes;
- presupuesto existente;
- fotos del vehículo;
- ficha técnica;
- comparativas;
- opciones de financiación;
- promociones vigentes;
- video/material aprobado cuando exista.

## Transiciones

Desde En Gestión:

- `En gestión`;
- `Entrevista`;
- `Cierre`;
- `Seña`;
- `Venta`;
- `Desistir`.

---

# 7. ENTREVISTA

## Significado

Existe una reunión comercial acordada con fecha y hora.

Modalidades permitidas:

- **Presencial**;
- **Videollamada**.

No se considera Entrevista una simple llamada de seguimiento o “llamame mañana”.

## Datos requeridos

- fecha;
- hora;
- modalidad;
- lugar si es presencial / medio correspondiente si es videollamada;
- objetivo de la entrevista;
- observación opcional.

## Próxima acción

La propia Entrevista es la próxima acción. No se duplica con otro “próximo contacto” equivalente.

## Condición interna

Sin crear nuevos estados del funnel, la entrevista puede estar:

- `scheduled`;
- `confirmed`;
- `rescheduled`;
- `no_show`;
- `completed`.

## Playbook

### Preparación

- revisar necesidad/modelo;
- revisar propuesta vigente;
- tener financiación disponible;
- tener información del usado si aplica.

### Confirmación

- confirmar asistencia;
- confirmar lugar/modalidad.

### Entrevista

- revisar propuesta;
- resolver dudas/objeciones;
- confirmar modalidad;
- ajustar condiciones cuando corresponda.

### Resultado

Registrar resultado y transición.

## Reprogramación

Permanece en `Entrevista`; se conserva la cita anterior como reprogramada y se crea la nueva.

## No-show

Permanece en `Entrevista` y se programa el contacto para recuperar/recoordinar. No pasa a `Sin contacto`.

## Transiciones

Desde Entrevista:

- `En gestión`;
- `Entrevista`;
- `Cierre`;
- `Seña`;
- `Venta`;
- `Desistir`.

No permite:

- `Nuevo`;
- `Sin contacto`;
- `Pide contacto futuro`;
- `Inválido` como salida operativa normal.

---

# 8. CIERRE

## Significado

La operación ya está suficientemente armada y la conversación principal es **definir si el cliente avanza con la compra o no**.

Cierre no es una segunda etapa de Gestión.

## Qué NO se define aquí

No se utiliza Cierre para descubrir o construir desde cero:

- anticipo;
- usado;
- modalidad;
- capacidad;
- alternativas generales.

Eso corresponde a Gestión.

## Condición de entrada

La oportunidad debe tener, según corresponda:

- vehículo/propuesta suficientemente definidos;
- modalidad de compra definida;
- propuesta económica concreta;
- objeción/condición final identificada;
- próximo paso de decisión.

## Objetivo

**Cerrar o no cerrar la venta.**

## Playbook

### Condición final

- propuesta vigente;
- condiciones definidas;
- objeción o impedimento final.

### Resolución

- resolver objeción final;
- confirmar decisión;
- solicitar seña / formalizar operación.

### Resultado

- continúa Cierre;
- Entrevista;
- En Gestión;
- Seña;
- Venta;
- Desistir.

## Transiciones

Desde Cierre:

- `Cierre`;
- `Entrevista`;
- `En gestión`;
- `Seña`;
- `Venta`;
- `Desistir`.

`Seña` **no vuelve a Cierre**. Una vez que existe compromiso económico, se preserva el estado Seña.

---

# 9. SEÑA

## Significado

El cliente realizó un **pago efectivo** destinado a reservar, iniciar, confirmar o formalizar la operación.

“No te señalo mañana” no alcanza: para ingresar a Seña debe haber ocurrido el hecho económico.

## Datos requeridos

- importe;
- fecha;
- concepto;
- medio de pago;
- comprobante/referencia cuando corresponda;
- vehículo/propuesta vinculada.

## Validación interna

Sin crear nuevos estados del funnel:

- `informada`;
- `confirmada`;
- `rechazada/corregir`.

## Regla estructural

**Seña es persistente.** Una vez alcanzada, el estado comercial se conserva hasta:

- `Venta`;
- `Desistir / Operación caída`.

No baja a Gestión, Entrevista o Cierre.

## Próximas acciones dentro de Seña

- documentación;
- datero;
- tasación si aplica;
- firma;
- validación administrativa;
- pago restante;
- definición/unidad;
- Entrevista cuando sea necesaria.

Una Entrevista posterior a una seña es una **acción dentro de Seña**, no una transición de estado.

## Si la operación se cae

Se conserva íntegramente:

- que hubo seña;
- importe;
- fecha;
- medio/comprobante;
- motivo de caída.

Resultado final posible:

- `Desistir` con motivo `Operación caída post-seña`.

## Transiciones

Desde Seña:

- `Seña`;
- `Venta`;
- `Desistir`.

---

# 10. VENTA

## Significado

El vendedor cerró la operación, cargó la venta, completó el datero y la envió a Administración según el circuito actual del CRM.

## Responsabilidad del vendedor

Termina cuando:

1. carga la venta;
2. completa el datero;
3. la envía a Administración.

## Después

Comienza el circuito administrativo existente.

Venta no requiere:

- próximo contacto comercial;
- playbook comercial;
- nuevas tareas de prospección.

Si Administración devuelve observaciones/correcciones, se manejan **dentro del circuito de Venta**; no se retrocede artificialmente a Cierre/Gestión.

## Estado

Terminal comercial.

---

# 11. DESISTIR

## Significado

La oportunidad comercial actual queda cancelada porque, entre otros casos:

- el cliente no quiere comprar;
- no se lo pudo contactar luego de múltiples intentos/protocolo;
- desistió de la operación;
- ocurrió una condición que hace que la situación de compra se cancele.

## Control

No se define una barrera artificial única para habilitar Desistir. El control se obtiene por el resto de la trazabilidad: tareas, intentos, protocolo, historial, tiempos y motivo obligatorio.

## Motivo obligatorio

Categorías sugeridas:

### Cliente

- No quiere comprar.
- Postergó compra.
- Compró en otro lugar.
- Eligió otra marca/modelo.
- Situación personal.
- Otro.

### Condición comercial

- Precio.
- Cuota.
- Anticipo.
- Financiación.
- Plazo de entrega.
- Producto/unidad no disponible.
- Condición comercial no aceptada.

### Contactabilidad

- **No contactado post protocolo**.

### Operación

- Operación caída.
- **Operación caída post-seña**.

Observación opcional.

## Base fría

Cuando el motivo es `No contactado post protocolo`:

- estado → `Desistir`;
- segmento → `Base fría`.

Base fría se trabaja luego como cartera de recuperación, no como estado del funnel activo.

## Reactivación

Si el cliente vuelve, no se borra Desistir. Se crea un nuevo ciclo que inicia en `Nuevo`, conservando el historial anterior.

---

# 12. INVÁLIDO / DATO ERRÓNEO

## Significado

El registro no puede gestionarse como una oportunidad comercial válida por un problema de identidad, contacto o integridad del registro.

No es una pérdida comercial.

## Casos

- teléfono inválido;
- teléfono de otra persona;
- dato de contacto incorrecto;
- duplicado;
- Lead de prueba;
- spam/no comercial;
- error de carga;
- otro motivo técnico/administrativo.

## Regla de transición

**Sólo puede alcanzarse desde:**

- `Nuevo`;
- `Sin contacto`.

No se permite desde:

- `Pide contacto futuro`;
- `En gestión`;
- `Entrevista`;
- `Cierre`;
- `Seña`;
- `Venta`.

Si un dato se descubre incorrecto después de que ya existe oportunidad real, se corrige el dato; no se invalida la oportunidad completa.

## Motivo

Obligatorio. Observación opcional.

## Duplicados

Debe conservarse vínculo con el registro válido cuando corresponda para no perder trazabilidad.

## Métricas

Se considera métrica de **calidad de Lead / fuente**, no tasa comercial de pérdida.

---

# 13. TRANSFERENCIAS Y REACTIVACIONES

## Regla única

**Toda transferencia o reactivación comienza desde `Nuevo`, conservando todo el historial previo.**

### Transferencia

Ejemplo conceptual:

```text
Ciclo 1 — Vendedor A
Nuevo → En Gestión → Cierre → Transferencia

Ciclo 2 — Vendedor B
Nuevo → ...
```

### Reactivación

```text
Ciclo 1
Nuevo → Sin contacto → Desistir (Base fría)

Cliente vuelve

Ciclo 2
Nuevo → ...
```

El historial debe conservar:

- vendedor anterior;
- estados recorridos;
- historias/gestiones cargadas;
- mensajes;
- presupuestos;
- entrevistas;
- objeciones;
- tareas;
- fechas;
- señas;
- motivo de desistimiento/transferencia;
- origen del nuevo ciclo.

La implementación técnica puede utilizar ciclos de oportunidad, eventos de ownership u otra estructura equivalente; la regla comercial no cambia.

---

# 14. Métricas futuras de Supervisor

No forman parte del score operativo del vendedor, pero la arquitectura debe preservar los eventos necesarios para calcularlas.

## Entrada y contacto

- Leads recibidos.
- Tiempo al primer intento.
- Tasa de contacto.
- Cumplimiento de protocolo.
- Distribución real de intentos por franja.
- Recuperación de Sin contacto.

## Gestión

- Gestiones iniciadas.
- Gestiones que avanzaron.
- **Gestiones que no avanzaron**.
- **Tasa de no avance**.
- Gestión → Entrevista.
- Gestión → Cierre.
- Gestión → Seña.
- Gestión → Venta.
- Tiempo promedio/mediano en Gestión.

La definición temporal exacta de “no avanzó” se validará con uso real antes de fijar umbrales automáticos.

## Entrevista

- agendadas;
- realizadas;
- reprogramadas;
- no-show;
- Entrevista → Gestión;
- Entrevista → Cierre;
- Entrevista → Seña;
- Entrevista → Venta;
- tasa de avance post-entrevista.

## Cierre

- ingresos a Cierre;
- Cierre → Entrevista;
- Cierre → Gestión;
- Cierre → Seña;
- Cierre → Venta;
- Cierre → Desistir;
- tiempo en Cierre;
- objeciones más frecuentes;
- objeciones asociadas a pérdida;
- cierres sin avance.

## Seña

- señas informadas/confirmadas;
- Seña → Venta;
- caída post-seña;
- tiempo Seña → Venta;
- importe promedio;
- días en Seña;
- motivos de caída.

## Desistir / calidad

- desistimientos por etapa;
- motivos de pérdida;
- caída post-seña;
- reactivaciones;
- conversión de reactivados;
- tasa de invalidez por fuente/campaña/proveedor.

---

# 15. Resumen de transiciones principales

```text
NUEVO
├─ Sin contacto
├─ Pide contacto futuro
├─ En gestión
├─ Entrevista
├─ Cierre
├─ Seña
├─ Venta
├─ Desistir
└─ Inválido

PIDE CONTACTO FUTURO
├─ Pide contacto futuro
├─ Sin contacto
├─ En gestión
├─ Entrevista
├─ Cierre
├─ Seña
├─ Venta
└─ Desistir

SIN CONTACTO
├─ Sin contacto
├─ Pide contacto futuro
├─ En gestión
├─ Entrevista
├─ Cierre
├─ Seña
├─ Venta
├─ Desistir
└─ Inválido

EN GESTIÓN
├─ En gestión
├─ Entrevista
├─ Cierre
├─ Seña
├─ Venta
└─ Desistir

ENTREVISTA
├─ Entrevista
├─ En gestión
├─ Cierre
├─ Seña
├─ Venta
└─ Desistir

CIERRE
├─ Cierre
├─ Entrevista
├─ En gestión
├─ Seña
├─ Venta
└─ Desistir

SEÑA
├─ Seña
├─ Venta
└─ Desistir

VENTA
└─ terminal comercial

DESISTIR
└─ terminal del ciclo; reactivación = nuevo ciclo desde Nuevo

INVÁLIDO
└─ terminal; sólo llega desde Nuevo/Sin contacto
```
