# CRM V2 — Especificación UI/UX

> Objetivo: traducir la Matriz Operativa CRM V2 a una experiencia de vendedor clara, moderna y orientada a la ejecución comercial real.
>
> La referencia visual aprobada es una evolución del CRM actual: sidebar oscuro, identidad visual existente, tarjetas limpias, jerarquía fuerte de próxima acción, playbooks contextuales y herramientas comerciales integradas.

## 1. Principio de diseño

La jerarquía UX debe ser:

**Cliente → Estado → Próxima acción → Contexto → Herramientas → Resultado**

Evitar el patrón anterior:

**Campos → Campos → Campos → Cambiar estado**

La UI debe ayudar al vendedor a responder:

1. ¿A quién tengo que trabajar ahora?
2. ¿Qué está pasando con ese cliente?
3. ¿Qué debería hacer a continuación?
4. ¿Qué herramientas/material necesito?
5. ¿Qué resultado produjo la acción?

---

# 2. Navegación lateral — conservar módulos actuales

El rediseño no reemplaza las funcionalidades existentes del CRM.

La sidebar conserva los módulos principales:

- **Mi Cartera** — evolución de `Mi agenda`.
- **Embudo comercial**.
- **Ranking**.
- **Presupuestos**.
- **Mis ventas**.
- **Rellamados**.
- **Proponer nuevo Lead**.
- **Nueva gestión**.
- **Actividad reciente**.

## Regla

Los estados comerciales **no** reemplazan los módulos del sidebar.

Los estados viven principalmente dentro de **Mi Cartera** y dentro de la ficha del Lead.

`Base fría` se considera un segmento de recuperación ligado a `Desistir post protocolo`; no debe competir visualmente como un estado activo principal del funnel.

---

# 3. MI CARTERA — Home del vendedor

## Objetivo

La home no es una agenda administrativa ni un dashboard de rendimiento.

Debe mostrar **qué oportunidades requieren trabajo y en qué orden**.

## Encabezado

- Título: `Mi Cartera`.
- Subtítulo orientativo: `Tus oportunidades comerciales, ordenadas por prioridad.`
- Búsqueda global.
- Filtros de estado.
- Filtros adicionales desplegables.
- Selector de vista cómoda/compacta si se mantiene en implementación.

## Búsqueda global

Buscar por:

- nombre;
- teléfono;
- DNI;
- modelo;
- otros identificadores ya disponibles en CRM.

## Filtros de estado visibles

- Todos.
- Nuevo.
- Sin contacto.
- Pide contacto futuro.
- En gestión.
- Entrevista.
- Cierre.
- Seña.

Pueden mostrar contador.

## Organización temporal

La cartera se organiza principalmente en:

### Requieren atención / Vencidos

Ejemplos:

- contacto futuro solicitado y no gestionado a tiempo;
- seguimiento de Gestión vencido;
- Entrevista pendiente/no gestionada;
- Cierre con próximo contacto vencido.

El vencimiento debe ser visible pero no convertir toda la pantalla en un “semáforo rojo”.

### Hoy

Orden cronológico por hora.

### Próximos

Orden cronológico por día y hora.

### Nuevos

Los nuevos todavía no tienen próximo contacto. En su tarjeta se muestra cuánto tiempo hace que ingresaron.

---

# 4. Tarjeta de Lead — información mínima accionable

La tarjeta debe poder entenderse en aproximadamente dos segundos.

## Datos principales

- hora / momento de acción cuando corresponda;
- nombre;
- modelo / versión;
- estado;
- objetivo de próxima acción;
- último contacto o contexto breve cuando aporte valor;
- CTA `Gestionar` / `Ver entrevista` / `Continuar operación` según estado.

## No mostrar en la tarjeta del vendedor

- vendedor asignado;
- campos administrativos redundantes;
- datos extensos de contacto;
- métricas de performance;
- porcentaje de cumplimiento como KPI de rendimiento.

## Ejemplos por estado

### Nuevo

```text
NUEVO
María López
Nivus
Ingresó hace 18 min
Meta Ads
[ Gestionar ]
```

### Sin contacto

```text
Carlos Díaz
Polo
SIN CONTACTO
Día 2 · Franja 14–16
✓ 10:18
✓ 11:37
○ Próximo intento 14:00–16:00
[ Gestionar ]
```

### Pide contacto futuro

```text
Sofía Martínez
Tera
PIDE CONTACTO FUTURO
Hoy · 17:00
Cliente pidió contacto después de las 17
[ Gestionar ]
```

### En gestión

```text
Juan Pérez
T-Cross Comfortline
EN GESTIÓN
Hoy · 18:00
Retomar propuesta
Último contacto: ayer 17:42
[ Gestionar ]
```

### Entrevista

```text
Martín Gómez
Amarok
ENTREVISTA
Hoy · 16:30
PRESENCIAL
Objetivo: Definir operación
[ Ver entrevista ]
```

### Cierre

```text
Lucas Pérez
Nivus
CIERRE
Hoy · 17:30
Confirmar decisión
Objeción: Valor final
[ Gestionar cierre ]
```

### Seña

```text
Carla Rodríguez
T-Cross
SEÑA
$500.000 · Confirmada
Próxima acción: Mañana 11:00
Completar datero
[ Continuar operación ]
```

---

# 5. Vista compacta

Opcional pero útil para vendedores con mucha cartera.

Ejemplo:

```text
10:30 | Juan Pérez | T-Cross | Gestión | Retomar propuesta
12:00 | María López | Nivus   | Cierre  | Confirmar decisión
15:30 | Carlos Díaz | Taos    | Entrev. | Presencial
```

La vista cómoda sigue siendo la experiencia principal.

---

# 6. Ficha del Lead — Workspace comercial

Al abrir un Lead no se debe utilizar un modal pequeño como experiencia principal.

Debe abrirse una ficha amplia / workspace, manteniendo el contexto del CRM.

## Estructura común

### A. Breadcrumb / regreso

`← Mi Cartera / [Estado]`

### B. Encabezado

- Nombre del cliente.
- Estado visible.
- Modelo / versión.
- teléfono / WhatsApp;
- origen;
- días en etapa;
- última interacción.

No mostrar `Vendedor asignado` en la superficie del propio vendedor.

### C. Próxima acción

Debe ser una de las áreas más visibles del workspace.

Según estado puede mostrar:

- próximo contacto;
- Entrevista;
- objetivo del contacto;
- fecha/hora;
- contexto breve;
- canal;
- acciones `Registrar resultado`, `Reprogramar`, `Abrir WhatsApp`, etc.

### D. Playbook contextual

El contenido cambia según el estado.

### E. Herramientas comerciales

- mensajes sugeridos;
- material sugerido;
- presupuesto;
- fotos;
- ficha técnica;
- comparativas;
- promoción vigente;
- datero cuando corresponda.

### F. Tabs / historial

Mantener y reforzar:

- Gestión.
- Historial.
- Conversación IA.
- Consultas anteriores.

---

# 7. Ficha — EN GESTIÓN

## Próximo contacto

Mostrar con prioridad:

- fecha;
- hora;
- objetivo;
- contexto;
- canal.

## Playbook

### Inicio

- Mensaje inicial.
- Modelo / versión confirmados.
- Necesidad principal.

### Propuesta

- Presupuesto enviado.
- Fotos del vehículo.
- Ficha técnica / comparativa.

### Calificación

- Modalidad definida.
- Anticipo / capacidad inicial.
- Usado en parte de pago.
- Urgencia de compra.

### Avance

- Objeción principal.
- Definir y programar próximo contacto.
- Intentar llevar a Entrevista o Cierre.

## Regla visual

El playbook debe sentirse como guía, no como formulario burocrático.

Se pueden mostrar acciones resueltas/pendientes/recomendadas. Si se utiliza una barra de avance, debe representar **contexto/completitud**, nunca un score de vendedor ni un objetivo de ranking.

---

# 8. Ficha — ENTREVISTA

## Área principal

Mostrar en lugar de “próximo contacto”:

- fecha;
- hora;
- modalidad: Presencial / Videollamada;
- lugar/medio;
- objetivo.

## Playbook

### Preparación

- modelo/necesidad;
- propuesta vigente;
- financiación disponible;
- usado si aplica.

### Confirmación

- confirmar asistencia;
- confirmar modalidad/lugar.

### Entrevista

- revisar propuesta;
- resolver dudas/objeciones;
- confirmar modalidad;
- ajustar condiciones.

### Resultado

- En Gestión;
- Entrevista nuevamente;
- Cierre;
- Seña;
- Venta;
- Desistir.

## Estados internos visibles cuando aporten valor

- Agendada.
- Confirmada.
- Reprogramada.
- No-show.
- Realizada.

---

# 9. Ficha — CIERRE

## Objetivo visual

La pantalla debe dejar claro que el propósito es **cerrar o no cerrar la venta**.

No convertirla en una segunda Gestión.

## Playbook

### Condición final

- propuesta vigente;
- condiciones definidas;
- objeción/impedimento final.

### Resolución

- resolver objeción;
- confirmar decisión;
- solicitar seña/formalizar.

### Resultado

- sigue en Cierre;
- Entrevista;
- En Gestión;
- Seña;
- Venta;
- Desistir.

## Tarjeta / encabezado

La objeción principal puede mostrarse porque es central para la etapa.

---

# 10. Ficha — SEÑA

## Encabezado

Mostrar claramente:

- importe;
- fecha;
- medio de pago;
- estado de validación;
- operación asociada.

## Principio

Una vez señado, el Lead permanece comercialmente en `Seña` hasta `Venta` o caída.

## Próximas acciones

Pueden ser:

- documentación;
- datero;
- tasación;
- firma;
- validación administrativa;
- pago restante;
- entrevista;
- definición de unidad.

Una entrevista dentro de Seña es una acción, no un cambio de estado.

## Resultado

- sigue en Seña;
- Venta;
- Operación caída / Desistir.

---

# 11. VENTA

La UI comercial termina cuando el vendedor:

1. carga la venta;
2. completa el datero;
3. envía a Administración.

Luego se utiliza `Mis ventas` y el circuito administrativo existente.

No agregar playbook comercial ni próximo contacto de prospección.

---

# 12. Mensajes sugeridos

Las plantillas deben estar disponibles a un clic dentro de la ficha y ser **editables**.

Plantillas iniciales:

- Mensaje inicial.
- Seguimiento con presupuesto.
- Envío de fotos.
- Ficha técnica / comparativa.
- Reactivación suave.
- Invitación a entrevista / cierre suave.

Acciones esperadas:

- Copiar.
- Usar / abrir WhatsApp cuando corresponda.

No convertir plantillas en mensajes obligatorios.

---

# 13. Material sugerido

Debe estar disponible desde el CRM para el modelo correspondiente.

Reutilizar material ya existente:

- Presupuesto.
- Fotos.
- Ficha técnica.
- Comparativas.
- Financiación.
- Promociones.
- Videos/material aprobado.

No duplicar almacenamiento si el asset ya existe.

---

# 14. Historial y Actividad reciente

La V2 debe enriquecer `Actividad reciente` y el historial del Lead con eventos estructurados:

- cambio de estado;
- llamada/intento;
- WhatsApp;
- presupuesto generado/enviado;
- material enviado;
- próximo contacto/reprogramación;
- entrevista;
- seña;
- venta;
- desistimiento;
- transferencia/reactivación.

Ejemplo:

```text
15:42 Juan Pérez — En Gestión → Cierre
15:31 María López — Presupuesto enviado
15:14 Lucas Gómez — Entrevista reprogramada
14:58 Carla Pérez — Seña registrada
```

---

# 15. Embudo comercial

Se conserva como módulo separado de Mi Cartera.

- Mi Cartera responde: **¿qué tengo que trabajar ahora?**
- Embudo responde: **¿cómo está distribuida mi cartera?**

Estados visibles:

- Nuevo.
- Sin contacto.
- Pide contacto futuro.
- En Gestión.
- Entrevista.
- Cierre.
- Seña.
- Venta cuando corresponda en analítica.

Al seleccionar una etapa debería poder abrir Mi Cartera filtrada por ese estado.

---

# 16. Ranking

Se conserva como módulo independiente.

No basar Ranking en:

- cantidad de checks del playbook;
- porcentaje de tareas completadas como métrica reina.

Las métricas comerciales y criterios de ranking se definen aparte.

---

# 17. Presupuestos

Se conserva el módulo actual.

Dos accesos:

1. desde sidebar para consultar todos los presupuestos;
2. desde la ficha del Lead para generar/ver/enviar el presupuesto relacionado.

No construir un segundo generador.

---

# 18. Mis Ventas

Se conserva el circuito existente.

Debe mostrar al vendedor sus ventas y estado administrativo posterior al datero/envío.

Las correcciones administrativas permanecen dentro del circuito de Venta.

---

# 19. Rellamados / Recuperación

Se conserva inicialmente el módulo `Rellamados`.

No fusionar todavía de forma automática:

- Rellamados;
- Base fría;
- Reactivaciones.

Más adelante puede evaluarse una superficie común de `Recuperación`, pero no es requisito de esta primera V2.

---

# 20. Nueva gestión / Proponer Lead

Ambos módulos existentes se conservan hasta revisar detalladamente sus flujos actuales.

Posibles superposiciones futuras:

- oportunidad manual;
- reactivación;
- transferencia;
- nuevo Lead manual.

No eliminar funcionalidad sin auditoría previa.

---

# 21. Mobile

Diseñar desde el inicio para uso móvil.

## Mi Cartera móvil

- chips de `Hoy / Vencidos / Todos`;
- tarjeta vertical;
- estado;
- objetivo;
- CTA grande `Gestionar`.

## Workspace móvil

- encabezado condensado;
- próxima acción primero;
- playbook en acordeones/secciones;
- mensajes/material como paneles accesibles;
- `Registrar resultado` siempre fácil de alcanzar.

---

# 22. Identidad visual

Mantener la continuidad del CRM actual:

- sidebar oscuro;
- azul/cian como acento;
- tipografía limpia;
- tarjetas oscuras/claras según tema vigente;
- iconografía simple;
- estados diferenciados sin convertir la UI en un semáforo.

La V2 debe sentirse como una **evolución clara del mismo producto**, no como una aplicación completamente distinta.

---

# 23. Referencias visuales aprobadas en diseño

Se validaron conceptualmente dos mockups durante la definición de producto:

1. **Mi Cartera**: sidebar actual preservado + filtros de estado + tarjetas organizadas en Vencidos / Hoy / Próximos.
2. **Ficha En Gestión**: workspace amplio con encabezado del Lead, próximo contacto protagonista, playbook central, mensajes/material lateral e historial inferior.

La implementación debe respetar la arquitectura y jerarquía de esos mockups, no necesariamente pixel-perfect en la primera iteración.

---

# 24. Orden recomendado de implementación UI

1. Mi Cartera — estructura base y filtros.
2. Tarjetas por estado.
3. Workspace común del Lead.
4. En Gestión completo.
5. Entrevista.
6. Cierre.
7. Seña.
8. Nuevo / Sin contacto / Pide contacto futuro.
9. Integración de herramientas existentes.
10. Refinamiento responsive/mobile.
11. Panel Supervisor como fase posterior.
