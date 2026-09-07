# IA V2 shadow runtime

Side-car puro: recibe datos, dependencias de extracción/knowledge y un repositorio limitado a `ai_v2_shadow_runs`; deliberadamente no acepta sender, Meta token ni mutadores comerciales. `AI_V2_SHADOW_MODE` sólo habilita cómputo/auditoría. `OPENAI_FILTER_MODEL` (fallback `gpt-4.1-mini-2025-04-14`) está separado de `OPENAI_V2_RESPONSE_MODEL`.

`filter-v1/` es una copia controlada byte-a-byte de `evals/grupo-sur-ai/src/filter-v1/`. La prueba de parity compara paths, contenido y fingerprint; toda promoción debe repetirse con `cp -a evals/grupo-sur-ai/src/filter-v1/. supabase/functions/_shared/filter-v1/`.
