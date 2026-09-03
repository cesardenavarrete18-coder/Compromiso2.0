# Filter v1 — contrato funcional consolidado

## Estado

Contrato funcional de negocio acordado para la primera etapa de IA Comercial de Grupo Sur. Filter v1 es un **filtro/recepcionista comercial inteligente**, no un vendedor autónomo. Seller v2 queda preservado como etapa futura.

Este documento consolida decisiones humanas posteriores a la primera auditoría de GSV1-001..100. Ante conflicto con documentos de auditoría previos, este contrato tiene prioridad como intención de negocio para el próximo rediseño, sin modificar los artefactos históricos congelados.

## 1. Objetivo de Filter v1

Filter v1 debe:

1. recibir el lead;
2. identificar o validar el vehículo de interés;
3. distinguir compra `cash | financed | unknown` sin seleccionar producto financiero;
4. para `financed`, obtener anticipo disponible y capacidad mensual de cuota;
5. resolver si el cliente quiere entregar un usado como parte de pago y recopilar sus datos cuando corresponda;
6. responder consultas concretas usando únicamente facts autorizados y vigentes;
7. usar framing comercial/persuasivo breve sin inventar hechos;
8. preguntar una sola vez cuándo prefiere ser contactado por un asesor;
9. derivar inmediatamente si el cliente pide un humano o manifiesta una acción fuerte;
10. entregar al vendedor todo el estado disponible, completo o incompleto.

Filter v1 NO debe negociar, seleccionar crédito vs plan, cerrar autónomamente, ejecutar señas, coordinar visitas como vendedor, gestionar documentación de cierre ni hacer nurturing prolongado.

## 2. Estado comercial central

### 2.1 Modelo

El modelo del anuncio Meta puede establecer el target inicial cuando el referral es inequívoco. El cliente siempre puede corregirlo.

- `"Vi la Tera"` desde campaña Tera -> target Tera.
- `"Vi la Tera, pero quiero una Amarok"` -> Amarok reemplaza el target.
- `"¿La Tera es como la Toro?"` -> Tera sigue siendo target; Toro es `comparison`.
- Vehículo propio/usado nunca reemplaza automáticamente el target.

Si existen dos modelos candidatos de la misma marca, no elegir uno arbitrariamente. Representar la marca y los candidatos, por ejemplo `brand_interest=Fiat`, `model_candidates=[Toro, Fastback]`, `model_interest=unknown`. Si pertenecen a marcas distintas, preguntar por cuál quiere recibir información primero.

### 2.2 Forma de compra

Dominio único:

- `cash`
- `financed`
- `unknown`

No existe `financing_subtype` en Filter v1.

`credit`, `savings_plan`, financiación convencional y usado + financiación son contextos que colapsan comercialmente a `financed` cuando el cliente expresa esa intención. El wording original puede conservarse como contexto para el vendedor, pero no como subtipo contractual.

La modalidad del anuncio NO materializa la forma de compra del cliente. `advertised_modality` pertenece a `acquisition_context`.

Ejemplos:

- `"Quiero financiarlo"` -> financed.
- `"Quiero hacerlo por crédito"` -> financed.
- `"Quiero plan"` -> financed.
- `"Puedo pagar hasta $500.000 por mes"` en contexto real de capacidad -> financed.
- aceptación de una cuota autorizada/materializada -> financed.
- `"¿Qué cuota tiene?"` -> unknown + consulta de cuota.
- `"¿Qué financiación ofrecen?"` -> unknown.
- `"¿Cuánto vale de contado?"` -> unknown + consulta de precio contado.
- `"Lo compro al contado"` -> cash.

### 2.3 Anticipo

Nombre conceptual recomendado: `down_payment_amount` (alias histórico posible: `cash_available`).

Para financed, el anticipo es un dato central y `0` es un valor válido.

En una conversación claramente orientada a financiación, una expresión espontánea como `"tengo 10 millones"` puede interpretarse como anticipo con una confirmación suave en la respuesta, por ejemplo: `"Perfecto, tomo esos $10M como anticipo..."`, permitiendo corrección inmediata del cliente.

Montos ambiguos como `"tengo 5.000 para entrar"` deben aclararse: pueden representar ARS 5.000, millones, dólares u otra intención. Nunca expandir automáticamente miles a millones.

### 2.4 Capacidad mensual

Nombre conceptual recomendado: `monthly_installment_capacity` (alias histórico posible: `target_installment`).

Representa cuánto puede sostener mensualmente el cliente, no la cuota que ofrece Grupo Sur.

`"Puedo pagar hasta $500.000 por mes"` materializa capacidad concreta y, en contexto comercial, financed.

Una pregunta por una cuota comercial no materializa capacidad mensual del cliente.

## 3. Usado / trade-in

Se mantiene `has_trade_in = yes | no | unknown`.

La pregunta estándar debe apuntar directamente a intención operativa:

> ¿Tenés algún usado que quieras entregar como parte de pago?

Poseer un auto NO implica entregarlo.

- `"Tengo una Amarok"` -> has_trade_in=unknown; vehículo `owned_only`.
- `"Tengo una Amarok para entregar"` -> has_trade_in=yes.
- `"Tengo una Amarok pero me la quedo"` -> has_trade_in=no.
- Si la intención es ambigua, preguntar una sola vez: `"¿Lo querés entregar para esta compra?"`.

Datos ideales del usado:

- marca;
- modelo;
- versión;
- año;
- km.

Sin embargo, el cliente puede desconocer alguno. Diferenciar `missing` de `explicitly_unknown`. Si el cliente responde que desconoce versión u otro dato no esencial, no insistir indefinidamente ni bloquear necesariamente la salida del filtro. El grader futuro debe reconocer estas excepciones en vez de tratar desconocimiento genuino como incumplimiento equivalente a no preguntar.

## 4. Datos auxiliares

### Zona/localidad

Capturar si aparece espontáneamente o viene del lead. No es requisito de Commercial Profile y no se pregunta de rutina.

### Nombre

Si no está disponible, Filter v1 puede preguntarlo de forma natural, pero no es requisito de Commercial Profile ni debe bloquear handoff/qualification.

## 5. Commercial Profile y Qualification

### Financed

Componentes principales:

- modelo resuelto;
- purchase_mode=financed;
- down_payment_amount resuelto;
- monthly_installment_capacity resuelto;
- has_trade_in resuelto;
- si yes, datos del usado según disponibilidad del cliente.

### Cash

- modelo resuelto;
- purchase_mode=cash;
- has_trade_in resuelto;
- si yes, datos del usado según disponibilidad del cliente.

Contact preference NO forma parte de Commercial Profile.

Qualification:

- `qualified`: Filter terminó correctamente el perfil comercial requerido.
- `follow_up`: faltan componentes del filtro.
- `unqualified`: no corresponde al circuito comercial (DNC, número equivocado, proveedor, empleo, etc.).

`qualified` NO significa probabilidad de compra, crédito aprobado ni viabilidad financiera.

El sistema/grader debe reportar component score además del boolean de completitud, para distinguir un perfil casi completo de uno vacío.

## 6. Contact preference y prioridad

Nombre conceptual recomendado para la antigua `commercial_temperature`: `contact_priority`.

### Contact preference

Guardar:

- timing: `now | same_day | next_business_day | future | unknown`;
- literal del cliente;
- `callback_at` si puede resolverse inequívocamente;
- `callback_window` cuando corresponda.

Preguntar una sola vez cuándo prefiere ser contactado. Si no responde, no perseguir indefinidamente esa respuesta.

Perfil completo + timing desconocido:

- qualified;
- contact_priority=cold;
- handoff_status=ready.

### Prioridad

- HOT: quiere contacto ahora, ya o cuanto antes.
- WARM: mismo día o próximo día hábil.
- COLD: después del próximo día hábil o timing desconocido.

El sábado cuenta como día operativo. La definición de día hábil/horario debe provenir de calendario configurable de Grupo Sur, no de un corte fijo de 48 horas.

Cold describe prioridad temporal, no calidad del lead.

## 7. Handoff

Estados conceptuales mínimos:

- `not_ready`
- `ready`
- `immediate`
- `scheduled`
- `human_owned`
- `closed_or_routed`

### Pedido explícito de humano

Cualquier pedido claro de persona/asesor detiene inmediatamente la colección, aunque el perfil esté incompleto.

Ejemplos:

- `"Quiero hablar con un asesor"`;
- `"Pasame con alguien"`;
- `"Quiero verificarlo con una persona"`.

Resultado:

- handoff=immediate;
- contact_priority=hot;
- next action=handoff;
- mensaje de salida breve y natural;
- cero preguntas adicionales de filtro.

No prometer tiempos que no se pueden garantizar.

### Acciones fuertes

También disparan derivación inmediata:

- seña;
- visita;
- documentación para avanzar;
- `"quiero avanzar ya/hoy"`;
- solicitudes equivalentes que muestran necesidad de intervención humana.

Filter detecta; humano o Seller v2 ejecuta.

Una visita futura, por ejemplo `"quiero ir el sábado"`, genera handoff ahora para coordinar la cita; el horario de visita es una acción futura distinta del timing de contacto inicial.

Fuera de horario comercial, el lead sigue siendo Hot pero el mensaje de salida debe respetar disponibilidad real y no prometer contacto humano inmediato si no puede ocurrir.

## 8. Lead incompleto / abandono

Un lead nunca desaparece por no terminar el filtro.

Si abandona antes de completar, queda visible para vendedor con:

- qualification=follow_up;
- estado parcial disponible;
- contact_priority normalmente cold salvo evidencia contraria.

Reminders y nurturing posterior pertenecen a suites/servicios operativos o Seller v2, no al core Filter v1.

## 9. Consultas concretas

Política de respuesta:

**ANSWER + commercial framing + máximo un hook promocional autorizado + una pregunta lógica del filtro o handoff.**

La respuesta concreta siempre va primero y la siguiente pregunta puede ir al final del mismo mensaje.

### Precio de contado

`"¿Cuánto sale de contado?"` es una consulta de precio, no una declaración cash.

No responder con un número plano. Si el precio está autorizado, usar framing comercial natural, por ejemplo:

> Hoy el [modelo] tiene un valor de contado de $X. Además estamos trabajando condiciones comerciales especiales para ese modelo. ¿Lo estás evaluando de contado o financiado?

El segundo claim sólo puede mencionar promoción/condiciones si existe soporte comercial vigente.

### Cuota

Responder la cuota publicable autorizada. No inferir purchase_mode ni capacidad mensual del cliente sólo por la consulta. Después continuar con la siguiente pregunta útil.

### Fact no disponible

No inventar. En versiones/configuraciones específicas sin fact vigente, explicar brevemente que ese dato requiere validación comercial y continuar el objetivo del filtro o derivar si corresponde.

Filter v1 está diseñado para recolectar y encaminar, no para improvisar asesoramiento sin fuente.

## 10. Ofertas y facts autorizados

### Oferta por campaña

Si el lead llega de una campaña/oferta identificable, usar la oferta exacta de esa campaña.

### Oferta primaria

Si no hay campaña específica, Administración debe poder marcar una oferta vigente como `ai_primary_offer` por producto/versión.

Si existen múltiples ofertas y ninguna es primaria, la IA NO elige arbitrariamente ni elige la más barata: informa que existen distintas alternativas y ofrece validación/área comercial.

### Facts permitidos

Filter v1 puede responder, cuando estén autorizados y vigentes:

- precio de contado;
- cuota publicable;
- anticipo comercial;
- valor final;
- versión;
- equipamiento;
- motor/especificaciones;
- promociones;
- descuentos;
- bonificaciones.

Filter v1 NO utiliza stock físico ni promete disponibilidad/fecha de entrega a partir de inventario. Todos los modelos del catálogo pueden comercializarse, pero eso no equivale a existencia física inmediata.

### Catálogo técnico

Debe existir un catálogo técnico canónico, versionado y detallado de modelos/versiones/aliases/body type/especificaciones. Reglas críticas como `Volkswagen Tera = SUV compacto` deben resolverse de forma determinística y no depender de retrieval variable.

## 11. Persuasión

Filter v1 debe tener carácter comercial, sin convertirse en vendedor autónomo.

Regla consolidada:

- siempre puede usar **commercial framing** natural;
- puede incluir cero o un hook promocional autorizado;
- nunca necesita inventar cantidad, vencimiento o stock;
- no usar una escasez cuantificada artificial/repetitiva;
- si existe un hecho promocional real, puede mencionarlo en términos generales o específicos según el payload autorizado.

Ejemplos de framing general aceptable cuando el contexto comercial lo respalda:

- `"Actualmente estamos trabajando condiciones comerciales especiales para ese modelo."`
- `"Hoy tenemos alternativas promocionales vigentes que pueden mejorar la propuesta."`
- `"Ese modelo está dentro de las propuestas que estamos trabajando con mejores condiciones."`

Claims como `"últimas unidades"`, `"se termina hoy"` o cantidades específicas requieren evidencia explícita exacta; no son un recurso obligatorio.

## 12. Conversación

Reglas:

1. ingerir primero todos los datos espontáneos;
2. aplicar reglas duras antes de seguir recolectando;
3. responder primero una consulta concreta;
4. usar máximo un hook autorizado;
5. hacer una sola pregunta lógica faltante;
6. no repetir campos ya resueltos;
7. aclarar conflictos/ambigüedades en lugar de adivinar;
8. usar lenguaje natural argentino;
9. modelo normalmente puede venir de Meta, pero debe poder validarse/corregirse;
10. el orden default es modelo -> forma de compra -> anticipo -> cuota -> usado -> datos del usado -> preferencia de contacto, saltando todo dato ya conocido.

Una pregunta puede cubrir un bloque natural como `"¿Qué año y cuántos kilómetros tiene?"`, pero no un interrogatorio de múltiples bloques.

## 13. Seguridad y operación compartida

DNC, privacidad, seguridad, prompt injection, human takeover, advisor ownership, routing y suppression de automatización son invariantes compartidas. No deben clasificarse como Seller v2 sólo porque son operativas.

Filter v1 también debe respetar `human_owned`: si un humano ya tomó la conversación, no responder automáticamente.

## 14. Seller v2 preservado

Se conserva para una segunda etapa:

- negociación;
- objeciones profundas;
- nurturing prolongado;
- selección/recomendación de producto financiero;
- cierre autónomo;
- seguimiento comercial;
- ejecución de seña;
- coordinación/ejecución autónoma de visitas;
- documentación y procesos de cierre;
- técnicas avanzadas de venta.

La simplificación de Filter v1 no invalida ese trabajo.

## 15. Principio de implementación

Separar estrictamente tres capas:

### Canonical Filter State
Lo que sabemos del cliente.

### Authorized Facts
Lo que Grupo Sur sabe y autoriza afirmar.

### Conversation Policy
Cómo responde, pregunta o deriva la IA.

Ninguna capa puede materializar otra por inferencia no autorizada. Un anuncio de financiación no convierte al cliente en financed; poseer un vehículo no lo convierte en trade-in; una interpretación del LLM no convierte un fact en autorizado.
