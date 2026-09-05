import { QUERY_INTENTS } from "./contracts.mjs";

export function intentResult(intent, effects = {}) {
  if (!QUERY_INTENTS.includes(intent)) throw new TypeError(`INVALID_QUERY_INTENT:${intent}`);
  return Object.freeze({ intent, purchase_mode_effect: "none", next_action: null, ...effects });
}

export function classifyQueryIntent(input) {
  const text = String(input ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim().replace(/^[¿?¡!\s]+|[?¡!]$/g, "");
  if (/\b(persona|asesor(?:a)?|alguien|humano)\b/.test(text) && /(hablar|pasame|comunicar|contact|verificar)/.test(text)) return intentResult("human_request", { handoff: "immediate" });
  if (/\b(sen(?:a|arlo)|transferir|documentacion|visitar|ir a ver|avanzar (?:hoy|ya|ahora))\b/.test(text)) return intentResult("strong_action", { handoff: "immediate" });
  if (/\b(suscrib\w*|entr(?:o|ar) al plan|arranc(?:o|ar) el plan|con cuanto (?:puedo )?entrar|necesito de entrada)\b/.test(text)) return intentResult("ambiguous_initial_amount", { next_action: "clarify_initial_amount_intent" });
  if (/\b(retirar|retiro|sacar el auto|anticipo necesito)\b/.test(text)) return intentResult("delivery_advance");
  if (/^(?:\?*)?(?:con|cuanto|qué|que).*\b(poner|monto inicial)\b/.test(text) && !/retir|sacar|plan|suscrib/.test(text)) return intentResult("ambiguous_initial_amount", { next_action: "clarify_initial_amount_intent" });
  if (/\b(cuota|pagaria por mes)\b/.test(text)) return intentResult("installment_offer");
  if (/\b(cuanto vale|cual es el valor|cuanto sale(?: de contado)?|cual es el precio|precio(?: de contado)?)\b/.test(text)) return intentResult("model_value");
  if (/\b(motor|motorizacion|potencia|cilindrada|caja|transmision|automatic[ao]|manual|version|equipamiento|seguridad|airbags?|adas|consumo|carroceria|pick[ -]?up|suv|dimensiones|baul|capacidad de carga|traccion|llantas|multimedia)\b/.test(text)) return intentResult("technical_question");
  if (/\b(quiero|voy a|lo pago|comprar)\b.*\b(contado|financiad|credito|plan)\b|\b(contado|financiar|credito)\b$/.test(text)) return intentResult("purchase_mode_statement", { purchase_mode_effect: /contado/.test(text) ? "cash" : "financed" });
  if (/^(si|no|cero|[\d.$ ]+)$/.test(text)) return intentResult("filter_answer");
  return intentResult("unknown");
}
