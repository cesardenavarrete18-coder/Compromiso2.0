# CRM V2 — Notas de Implementación y Contexto

> Este documento conserva decisiones técnicas, riesgos y pendientes para continuar la implementación sin depender del historial del chat.

## 1. Rama y seguridad

Rama activa de este trabajo:

`feat/crm-en-gestion-playbook`

Al inicio de esta consolidación documental la rama estaba en:

`4aeeaffd1dc33192d23c292fc9bab771f6addeb9`

No modificar ni mergear `main` sin autorización explícita.

La UI/UX y la matriz pueden avanzar en Preview/branch sin despliegue productivo.

---

## 2. Documentos de autoridad de CRM V2

- `docs/crm-v2-operating-matrix.md` — matriz consolidada de estados, reglas y transiciones.
- `docs/crm-v2-ui-ux-spec.md` — especificación de interfaz y experiencia.
- `docs/crm-en-gestion-operating-matrix.md` — documento específico de En Gestión creado durante la primera iteración.

Ante diferencias futuras, la matriz consolidada debe reflejar las últimas decisiones aprobadas.

---

## 3. Compatibilidad de estado actual

Durante la primera iteración se decidió conservar el valor interno existente `en_proceso` por compatibilidad y presentarlo al usuario como **En gestión**.

No realizar una migración destructiva de estados sólo por cambio de etiqueta.

La matriz V2 debe implementarse mediante reglas explícitas de transición, no comparando estados como una jerarquía numérica rígida.

---

## 4. Próximo contacto canónico

No crear un segundo sistema de agenda/seguimiento.

Reutilizar el mecanismo canónico actual de próximo contacto y evolucionar la UX alrededor de él.

Para estados que requieren seguimiento (especialmente En Gestión y Cierre):

- fecha y hora son obligatorias;
- “Sin próximo contacto” no es una bandeja válida;
- la UI debe impedir crear nuevos casos inconsistentes.

### Datos históricos a sanear antes de producción

Se detectaron **47 Leads existentes en producción en `en_proceso` sin próximo contacto**.

No asignarles fechas u horarios artificiales para satisfacer la nueva regla.

Antes de activar una restricción productiva deben sanearse mediante una acción explícita/real del vendedor o un proceso aprobado que no fabrique información comercial.

---

## 5. En Gestión — primera implementación ya iniciada

La rama ya contiene trabajo inicial asociado a En Gestión, incluyendo:

- modelo/configuración de playbook;
- estilos de primera iteración;
- persistencia estructurada del playbook;
- documento operativo específico.

La intención es reutilizar:

- próximo contacto existente;
- generador de presupuestos existente;
- assets de fotos/PDFs existentes;
- historial y módulos actuales del CRM.

No duplicar esas capacidades.

---

## 6. Persistencia de Playbook

La primera estructura diseñada utiliza eventos e items estructurados para separar:

- **estado actual** de cada acción del playbook;
- **historial de cambios** de esas acciones.

Esto permite medir y auditar después sin depender de texto libre.

Principio:

> Persistir hechos/eventos primero. Decidir métricas y umbrales después de observar uso real.

No utilizar automáticamente el porcentaje de playbook como score de vendedor.

---

## 7. Supervisor — fase posterior

El Panel Supervisor V2 debe diseñarse después de consolidar la experiencia operativa del vendedor.

Debe poder calcular, entre otras:

- cumplimiento y horario real del protocolo de contacto;
- contacto efectivo;
- conversiones por transición;
- Gestión que avanzó / no avanzó;
- tasa de no avance;
- tiempo por estado;
- Entrevistas agendadas/realizadas/no-show;
- conversiones de Cierre;
- Seña → Venta;
- caída post-seña;
- motivos de desistimiento;
- calidad/invalidez por fuente;
- transferencias y reactivaciones.

No fijar todavía un umbral arbitrario de “Gestión estancada = X días”. Obtener datos reales primero.

---

## 8. Goodhart — criterio de producto

El rediseño nace de un problema detectado en el enfoque anterior:

`Tarea vencida` era utilizada como proxy de “Lead trabajado”.

Eso incentiva que el vendedor optimice el estado administrativo de la tarea en lugar del objetivo comercial real.

CRM V2 debe preservar varias señales simultáneas:

- protocolo ejecutado;
- horario real;
- contacto efectivo;
- avance de estado;
- resultados comerciales;
- historial.

Evitar reemplazar una métrica única defectuosa por otra métrica única (por ejemplo, cantidad de llamadas o checks del playbook).

---

## 9. Protocolo de Sin contacto

La implementación debe permitir parametrizar:

- franjas 10–12 / 14–16 / 17–19;
- cantidad de intentos por franja;
- cantidad de días;
- secuencia de WhatsApp.

Cada intento debe conservar horario exacto y resultado.

Al completar el protocolo sin respuesta:

- `Desistir`;
- motivo `No contactado post protocolo`;
- segmento `Base fría`;
- mensaje automático de puerta abierta.

No mover a Base fría sólo por paso del tiempo.

---

## 10. Transferencias y reactivaciones

Regla aprobada:

- transferencia → nuevo ciclo desde `Nuevo`;
- reactivación → nuevo ciclo desde `Nuevo`;
- conservar íntegramente historias/gestiones e historial previo.

La implementación técnica debe permitir reconstruir:

- ciclo;
- propietario/vendedor;
- estado previo;
- transferencias;
- motivo/origen de reactivación;
- quién consiguió contacto;
- quién gestionó;
- quién cerró.

No borrar/reescribir el ciclo anterior.

---

## 11. Seña como estado persistente

Una vez que existe una seña efectiva:

- no volver a Gestión;
- no volver a Entrevista como estado;
- no volver a Cierre.

Una Entrevista posterior se modela como **acción dentro de Seña**.

Seña termina comercialmente en:

- `Venta`;
- `Desistir / Operación caída`.

Siempre conservar el hecho de que existió la seña.

---

## 12. Venta y Administración

La responsabilidad comercial del vendedor termina cuando:

1. carga la venta;
2. completa el datero;
3. la envía a Administración.

No rediseñar innecesariamente el circuito administrativo existente en esta fase.

Las observaciones posteriores pertenecen a Venta/Administración, no provocan retroceso artificial en el funnel comercial.

---

## 13. Inválido

`Inválido / Dato erróneo` sólo se permite desde:

- `Nuevo`;
- `Sin contacto`.

Después de existir interacción comercial válida, un dato incorrecto se corrige; no se invalida la oportunidad completa.

Inválido es una métrica de calidad de adquisición, no pérdida comercial.

---

## 14. UI/UX — estrategia de implementación

No rediseñar todos los módulos del CRM desde cero.

Preservar:

- sidebar / módulos;
- Embudo;
- Ranking;
- Presupuestos;
- Mis Ventas;
- Rellamados;
- Proponer nuevo Lead;
- Nueva gestión;
- Actividad reciente;
- Historial;
- Conversación IA;
- Consultas anteriores.

Rediseñar prioritariamente:

1. `Mi agenda` → `Mi Cartera`.
2. Tarjetas de oportunidad.
3. Workspace/ficha del Lead.
4. Playbooks por estado.
5. Próxima acción/resultado.
6. Acceso contextual a mensajes/material/presupuesto/datero.

La identidad visual debe evolucionar el CRM actual, no reemplazarlo por un producto visualmente desconectado.

---

## 15. Orden recomendado antes de una implementación amplia

1. Congelar Matriz Operativa.
2. Congelar especificación UI/UX común.
3. Construir Mi Cartera.
4. Construir workspace común.
5. En Gestión.
6. Entrevista.
7. Cierre.
8. Seña.
9. Nuevo/Sin contacto/Pide contacto futuro.
10. Integraciones con módulos existentes.
11. Responsive/mobile.
12. Supervisor V2.
13. Saneamiento de datos incompatibles antes de cualquier restricción productiva.

---

## 16. Regla de desarrollo

La implementación debe seguir el diseño y la matriz como contrato funcional.

Claude Code u otro agente de código puede utilizar estos documentos como especificación, pero no debe inventar nuevas reglas de producto (estados, transiciones, scores, automatizaciones o eliminaciones de módulos) sin aprobación.
