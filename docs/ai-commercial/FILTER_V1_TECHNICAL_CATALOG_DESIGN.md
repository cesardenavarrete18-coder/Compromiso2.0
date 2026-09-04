# Filter v1 — catálogo técnico canónico

## Objetivo

Materializar una taxonomía estructurada y versionada, independiente de la variabilidad de RAG. Entidades futuras: `catalog_versions`, `catalog_brands`, `catalog_models`, `catalog_model_aliases`, `catalog_variants`, `catalog_variant_aliases`, `catalog_specs`. Modelo y variante usan IDs estables; cada versión registra effective_at, source manifest, approver y checksum. Publicar una versión es atómico y reversible.

Campos: marca; modelo; aliases normalizados; variante; body type enum; motor estructurado; specs/equipment clave con unidad; `active` (catálogo); `commercially_offered` mediante fact comercial aplicable, nunca stock. Aliases no se mezclan con display names y colisiones bloquean publicación. Specs incluyen claim scope, source document/version y `explicitly_unknown` cuando el fabricante no lo informa.

## Hallazgo en el repo

* `public.brands` y `public.models` existen en `supabase/schema.sql`; model sólo tiene nombre, textos comerciales e imagen, no aliases/body type/specs/versión canónica.
* `public.campaigns.version_name` y tablas posteriores `vehicle_versions`/vínculos de ofertas representan versiones comerciales, pero no forman una taxonomía técnica completa.
* `assets/*.pdf` contiene fichas por modelo y assets web nombran modelos; son fuentes candidatas, no registros versionados ni prueba de vigencia.
* `ai_knowledge_documents` conserva PDF/OpenAI file ID y el webhook usa Vector Store/file search. Sirve para explicación documental, no para identidad/body type determinista.
* `evals/grupo-sur-ai/src/candidate-v2.3/operative-catalog.mjs` es un guard mínimo reutilizable como fixture de migración, no autoridad futura.
* Migrations agregan Toro, Fiorino y Polo Robust al catálogo comercial; prueban schema/seed, no filas vivas actuales.

## Fuente futura y pipeline

Reusar IDs de `brands`/`models` donde la identidad sea inequívoca. Agregar capa técnica normalizada y manifest de publicación, no derivar cada turno desde PDF. Flujo: cargar documento autorizado -> extracción en draft -> validación humana -> tests de aliases/unidades -> publicación inmutable -> proyección/cache runtime. RAG sólo amplía texto con la misma versión/source; ante desacuerdo gana el catálogo publicado y se abre revisión.

## Caso crítico Tera

Fixture obligatorio: `{brand:"Volkswagen", model:"Tera", body_type:"compact_suv", aliases:["VW Tera"]}` y regla negativa `body_type != pickup`. “¿Es como la Toro?” mantiene Tera como target y Toro como comparison. Tests deben fallar cerrados si falta la versión del catálogo, jamás pedir al generador que clasifique libremente.

## Cambios propuestos (no ejecutados)

Preferir extensión controlada de brands/models y nuevas tablas de versiones/aliases/specs; evaluar si `vehicle_versions` comercial puede referenciar `catalog_variants` antes de crear duplicados. Administración necesita draft/publish/rollback y vista de provenance. No migration ni carga remota en esta fase.
