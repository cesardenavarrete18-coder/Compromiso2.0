const policy = `POLÍTICA DE PRIVACIDAD — GRUPO SUR AUTOMOTORES

Última actualización: 14 de agosto de 2026

Esta política explica cómo Grupo Sur Automotores, operado comercialmente por CDN Automotores SRL, trata los datos personales recibidos a través de WhatsApp, formularios web y herramientas internas vinculadas a la atención comercial.

1. RESPONSABLE Y CONTACTO

Responsable: CDN Automotores SRL / Grupo Sur Automotores.
Domicilio comercial: Paraguay 346, 3.er piso, Ciudad Autónoma de Buenos Aires, Argentina.
Contacto de privacidad: cesardenavarrete18@gmail.com

2. DATOS QUE PODEMOS TRATAR

• Nombre, teléfono, correo electrónico y demás datos de contacto.
• Contenido e historial de las conversaciones mantenidas por WhatsApp.
• Vehículo de interés, modalidad de compra, anticipo estimado, vehículo usado y preferencias comerciales.
• Información identificatoria o económica que la persona decida proporcionar para solicitar una gestión o precalificación.
• Datos técnicos mínimos asociados al origen, fecha y estado de la consulta.

3. FINALIDADES

• Responder consultas sobre vehículos, planes, financiación y servicios relacionados.
• Clasificar y priorizar contactos comerciales.
• Asignar consultas a supervisores y vendedores autorizados, evitando asignaciones duplicadas.
• Realizar seguimiento de la atención y mejorar la calidad del servicio.
• Cumplir obligaciones legales, prevenir abusos y proteger la seguridad de los sistemas.

4. USO DE INTELIGENCIA ARTIFICIAL

Podemos utilizar sistemas de inteligencia artificial para interpretar mensajes, resumir la consulta, identificar el vehículo de interés y asistir en el enrutamiento del contacto. La IA funciona como apoyo operativo: no concede créditos, no aprueba financiaciones ni adopta por sí sola decisiones comerciales o jurídicas vinculantes.

5. PROVEEDORES Y DESTINATARIOS

Los datos podrán ser tratados por personal autorizado, supervisores, vendedores y proveedores tecnológicos necesarios para prestar el servicio, entre ellos Meta/WhatsApp, OpenAI y Supabase. Estos proveedores actúan conforme a sus propios términos y medidas de seguridad. Algunos tratamientos pueden implicar infraestructura ubicada fuera de Argentina.

6. CONSERVACIÓN Y SEGURIDAD

Conservamos la información durante el tiempo razonablemente necesario para atender y documentar la gestión comercial, cumplir obligaciones aplicables y resolver reclamos. Aplicamos controles de acceso, permisos por rol y medidas técnicas destinadas a evitar accesos, modificaciones o divulgaciones no autorizadas.

7. DERECHOS DE LAS PERSONAS

La persona titular puede solicitar acceso, actualización, rectificación o supresión de sus datos conforme a la Ley argentina 25.326. También puede retirar su consentimiento para contactos comerciales futuros.

8. SOLICITUD DE ELIMINACIÓN DE DATOS

Para solicitar la eliminación, escribí a cesardenavarrete18@gmail.com con el asunto “Solicitud de eliminación de datos”, indicando el número de WhatsApp utilizado y la información necesaria para verificar la titularidad. La solicitud será evaluada y atendida dentro de los plazos legales, salvo que exista una obligación válida de conservación.

9. CONSENTIMIENTO Y ACTUALIZACIONES

Al iniciar una consulta y proporcionar datos de forma voluntaria, la persona reconoce este tratamiento para las finalidades informadas. Esta política puede actualizarse para reflejar cambios legales, operativos o tecnológicos; la versión vigente estará disponible en esta misma URL.

10. AUTORIDAD DE CONTROL

La Agencia de Acceso a la Información Pública es la autoridad de control de la Ley 25.326 y recibe consultas o denuncias relacionadas con la protección de datos personales.

Grupo Sur Automotores · CDN Automotores SRL · Ciudad Autónoma de Buenos Aires
`;

Deno.serve((request) => {
  if (request.method === "HEAD") {
    return new Response(null, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  if (request.method !== "GET") {
    return new Response("Method not allowed", { status: 405, headers: { "Allow": "GET, HEAD" } });
  }
  return new Response(policy, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
