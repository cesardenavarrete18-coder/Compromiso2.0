# M1-04B — inventario y permisos before/after

Catálogo real extraído durante DB-B04, antes de los grants exclusivos del fixture. Fuente: `evidence/final-catalog.json`. El inventario DDL completo es `evidence/candidate-object-index.json`.

Se crean **5 tablas, 33 funciones, 23 triggers, 5 policies y 8 índices explícitos** (además de los índices de PK/UNIQUE). Se reemplazan 22 funciones caracterizadas y el gateway existente.

Todas las tablas B estaban ausentes antes de la candidata. Después:

| Tabla privada | Owner | RLS / FORCE | ACL real |
|---|---|---|---|
| `crm_contact_facts` | `crm_runtime_owner` | True / True | `['crm_runtime_owner=arwdDxtm/crm_runtime_owner', 'postgres=ar/crm_runtime_owner']` |
| `crm_contact_next_action_adoptions` | `crm_runtime_owner` | True / True | `['crm_runtime_owner=arwdDxtm/crm_runtime_owner', 'postgres=r/crm_runtime_owner']` |
| `crm_contact_runtime` | `crm_runtime_owner` | True / True | `['crm_runtime_owner=arwdDxtm/crm_runtime_owner', 'postgres=rw/crm_runtime_owner']` |
| `crm_contact_task_credits` | `crm_runtime_owner` | True / True | `['crm_runtime_owner=arwdDxtm/crm_runtime_owner', 'postgres=arw/crm_runtime_owner']` |
| `crm_next_actions` | `crm_runtime_owner` | True / True | `['crm_runtime_owner=arwdDxtm/crm_runtime_owner', 'postgres=arw/crm_runtime_owner']` |

Las ACL usan la notación PostgreSQL; los roles API no tienen acceso directo. Las cinco policies son exclusivamente para `crm_runtime_owner`, con USING/WITH CHECK true; FORCE RLS obliga al owner a pasar por ellas. B05 verifica el rechazo real al quitar temporalmente la policy y revierte el experimento.

Funciones nuevas; antes no existían. D = SECURITY DEFINER, I = SECURITY INVOKER. El catálogo conserva también configuración y ACL exactas.

| Firma | Owner | Seguridad | EXECUTE / ACL |
|---|---|---|---|
| `crm_read_contact_work_context(uuid)` | `crm_runtime_owner` | D | `crm_runtime_owner=X/crm_runtime_owner` |
| `private.crm_adopt_contact_lead(uuid,uuid,bigint,text)` | `crm_runtime_owner` | D | `crm_runtime_owner=X/crm_runtime_owner; postgres=X/crm_runtime_owner` |
| `private.crm_apply_contact_command(uuid,uuid)` | `postgres` | D | `postgres=X/postgres; crm_runtime_owner=X/postgres` |
| `private.crm_contact_adoption_snapshot(uuid)` | `postgres` | D | `postgres=X/postgres; crm_runtime_owner=X/postgres` |
| `private.crm_contact_apply_restriction(uuid)` | `postgres` | D | `postgres=X/postgres; crm_runtime_owner=X/postgres` |
| `private.crm_contact_assert_legacy_writer(uuid,text)` | `postgres` | D | `postgres=X/postgres` |
| `private.crm_contact_authorization(uuid)` | `crm_runtime_owner` | D | `crm_runtime_owner=X/crm_runtime_owner; postgres=X/crm_runtime_owner` |
| `private.crm_contact_close_protocol(uuid,uuid,text)` | `postgres` | D | `postgres=X/postgres; crm_runtime_owner=X/postgres` |
| `private.crm_contact_credit_fact(uuid,uuid,uuid,boolean)` | `postgres` | D | `postgres=X/postgres; crm_runtime_owner=X/postgres` |
| `private.crm_contact_emit(uuid,uuid,text,jsonb)` | `postgres` | D | `postgres=X/postgres; crm_runtime_owner=X/postgres` |
| `private.crm_contact_guard_customer_restriction()` | `postgres` | D | `postgres=X/postgres` |
| `private.crm_contact_guard_lead_restriction()` | `postgres` | D | `postgres=X/postgres` |
| `private.crm_contact_guard_legacy_rows()` | `postgres` | D | `postgres=X/postgres` |
| `private.crm_contact_guard_legacy_truncate()` | `postgres` | D | `postgres=X/postgres` |
| `private.crm_contact_is_adopted(uuid)` | `crm_runtime_owner` | D | `crm_runtime_owner=X/crm_runtime_owner; postgres=X/crm_runtime_owner` |
| `private.crm_contact_json_shape(jsonb,text[],text[])` | `crm_runtime_owner` | I | `crm_runtime_owner=X/crm_runtime_owner` |
| `private.crm_contact_normalize_action_ref(jsonb)` | `crm_runtime_owner` | I | `crm_runtime_owner=X/crm_runtime_owner` |
| `private.crm_contact_normalize_fact(jsonb,boolean)` | `crm_runtime_owner` | I | `crm_runtime_owner=X/crm_runtime_owner` |
| `private.crm_contact_normalize_new_action(jsonb)` | `crm_runtime_owner` | I | `crm_runtime_owner=X/crm_runtime_owner` |
| `private.crm_contact_normalize_payload(text,jsonb)` | `crm_runtime_owner` | I | `crm_runtime_owner=X/crm_runtime_owner` |
| `private.crm_contact_normalize_uuid(jsonb)` | `crm_runtime_owner` | I | `crm_runtime_owner=X/crm_runtime_owner` |
| `private.crm_contact_parent_barrier(uuid)` | `postgres` | D | `postgres=X/postgres; crm_runtime_owner=X/postgres` |
| `private.crm_contact_read_legacy(uuid)` | `postgres` | D | `postgres=X/postgres; crm_runtime_owner=X/postgres` |
| `private.crm_contact_refresh_projection(uuid,uuid)` | `postgres` | D | `postgres=X/postgres` |
| `private.crm_contact_reject_immutable()` | `crm_runtime_owner` | I | `crm_runtime_owner=X/crm_runtime_owner` |
| `private.crm_contact_review_revision(uuid)` | `crm_runtime_owner` | D | `crm_runtime_owner=X/crm_runtime_owner; postgres=X/crm_runtime_owner` |
| `private.crm_contact_schedule_action(uuid,uuid,jsonb)` | `postgres` | D | `postgres=X/postgres; crm_runtime_owner=X/postgres` |
| `private.crm_contact_validate_references()` | `postgres` | D | `postgres=X/postgres` |
| `private.crm_contact_validate_text(jsonb,boolean)` | `crm_runtime_owner` | I | `crm_runtime_owner=X/crm_runtime_owner` |
| `private.crm_contact_validate_timestamp(jsonb)` | `crm_runtime_owner` | I | `crm_runtime_owner=X/crm_runtime_owner` |
| `private.crm_contact_validate_timezone(jsonb)` | `crm_runtime_owner` | I | `crm_runtime_owner=X/crm_runtime_owner` |
| `private.crm_execute_contact_command(jsonb)` | `crm_runtime_owner` | I | `crm_runtime_owner=X/crm_runtime_owner` |
| `private.crm_normalize_contact_command(jsonb)` | `crm_runtime_owner` | I | `crm_runtime_owner=X/crm_runtime_owner` |

Reemplazos focales. Antes = captura identificada en el manifest; después = catálogo instalado. DB-B04 compara owners y ACL exactamente. Sólo `enforce_en_gestion_next_contact` cambia I→D; todos conservan owner postgres y sus grants previos.

| Firma | Seguridad antes→después | MD5 prosrc antes→después |
|---|---|---|
| `private.cancel_lead_contact_protocol(uuid,text)` | D→D | `35c8d8a86580a2bcb9010c6b546e3cf9` → `6c4911b7f722e8c4f95addd08c6c48a1` |
| `private.classify_completed_contact_protocol()` | D→D | `2b380d46640508dfcb0b6909fe5f27d0` → `0f70a98a52966d225db5eacb9a68be24` |
| `private.classify_exhausted_contact_protocol(uuid,uuid,text)` | D→D | `535fd72fd7181f8214a6478f608b6d7c` → `9ef0b21292dd9b256ef933a32b04434d` |
| `private.create_lead_contact_sequence(uuid,uuid,timestamp with time zone)` | D→D | `4df2ba9ae29d71297f933e7c9ac66053` → `9fd500d39fa5267d3dcb41ed679181f4` |
| `private.enforce_en_gestion_next_contact()` | I→D | `c516e81a1494060f6899759938c9a204` → `61f78c5fb5cb32f836a1b551f9bf15b5` |
| `private.ensure_lead_customer()` | D→D | `61336cb9e76a26a39f84f4f5c00b107b` → `cf20272eadbe699032c34cb1513b2324` |
| `private.keep_protocol_deadlines_out_of_manual_agenda()` | D→D | `50baad34e98737b87b77caedb4639f01` → `71323128d6d5c532f7300f3886197945` |
| `private.sync_contact_sequence_with_status()` | D→D | `1e146d77f5395a1663928b7014e7c4d2` → `8461a031d8871be37d8a10872964fecd` |
| `private.sync_protocol_next_action(uuid,uuid)` | D→D | `ccbfedd011059c2550768bb93cd0891b` → `e1e309f6453ebfa6edbfc27f06a915ea` |
| `public.complete_contact_task(uuid,text,text)` | D→D | `d552badd3ad44c9fcdcf49cecb3dcd00` → `b6a199088be3d97e5f2b6a8263d49f8c` |
| `public.complete_contact_task_with_follow_up(uuid,text,text,timestamp with time zone,text)` | D→D | `d7b5f3b5164afad82e1cd0ce0b218c7d` → `613d969d19408af407e57ffefefc7825` |
| `public.record_contact_answer_with_transition(uuid,text,text,text,timestamp with time zone,text,text,timestamp with time zone,text,numeric,text,timestamp with time zone,text,text,text)` | D→D | `b29d080fc94a279f1b28d881322c9530` → `57c7aa09646baa2bc49f68db3c5f04bb` |
| `public.record_contact_answer_with_transition(uuid,text,text,timestamp with time zone,text,text,timestamp with time zone,text,numeric,text,timestamp with time zone,text,text,text)` | D→D | `4355de2adfe5b23e9326bf2e7601b400` → `71682f3716f39dbd562343f1665ee2a3` |
| `public.record_contact_task_result(uuid,text,text,timestamp with time zone)` | D→D | `385b4b880f68aaa586cc6686910df08d` → `fd3e34a236571ff83b525aa999f6ba6d` |
| `public.record_lead_follow_up(uuid,text,text,timestamp with time zone,text,text,timestamp with time zone,text,numeric,text,text,text,text,text)` | D→D | `4991b76f765a7570f7f65cb591c20b92` → `55b0b6d85e74276aeafb6829c247395b` |
| `public.refresh_due_contact_protocols()` | D→D | `5ad7edd955935b946e7b2f642ac441ee` → `e0265b8164b88b0b41c1c3f958015cbc` |
| `public.reconcile_lead_contact_protocol(uuid)` | D→D | `adb686286ed68a179e306d689128f2a6` → `4c588d65edf4663c689e04bbc176a8f9` |
| `public.record_recall_attempt(uuid,text,text,timestamp with time zone,text,timestamp with time zone,text)` | D→D | `df3bf63be03d363c287ed1c1ae601b66` → `3a8a669f28c28842d6d29cef6e0d4df7` |
| `public.restart_lead_contact_sequence(uuid)` | D→D | `b3ff1f1235718f514e3bf2e171ea896a` → `fc317586410837f8d01eb6384e459184` |
| `public.start_no_contact_protocol_from_future(uuid)` | D→D | `abeb15a817e3cc82da752efc42a54fb1` → `a50ed4eaff8c78458ec490639eb121f3` |
| `public.supervisor_manage_lead(uuid,text,text,text,text,timestamp with time zone,text,text,text)` | D→D | `1526945f104c3f95c90e2613cecef606` → `6ea951780d93fa553c46d9296428c552` |
| `private.crm_assignment_guard_commercial_seller()` | D→D | `a1ea0b4a9425dfcce386e94db0d2728c` → `36be76de1872b76682c0554db9dbd7d7` |

`public.crm_submit_command(jsonb)` conserva owner `crm_runtime_owner`, DEFINER y search_path vacío; añade despacho de los seis comandos B, preserva A/Foundation y permanece cerrado a API al instalar. El nuevo getter es STABLE, DEFINER y sin grants API; no modifica filas. No se reemplaza ninguna policy legacy, ni el helper de WhatsApp, ni la RPC de modo humano.

Triggers nuevos; los siete triggers legacy caracterizados conservan su enlace al mismo objeto función. Los cambios de comportamiento ocurren en esas funciones y en las guardas B nuevas.

| Tabla | Trigger nuevo |
|---|---|
| `private.crm_contact_next_action_adoptions` | `crm_contact_adoptions_immutable` |
| `private.crm_contact_next_action_adoptions` | `crm_contact_adoptions_no_truncate` |
| `private.crm_contact_facts` | `crm_contact_facts_immutable` |
| `private.crm_contact_facts` | `crm_contact_facts_no_truncate` |
| `private.crm_contact_runtime` | `crm_contact_runtime_no_delete` |
| `private.crm_contact_runtime` | `crm_contact_runtime_no_truncate` |
| `private.crm_next_actions` | `crm_next_actions_no_delete` |
| `private.crm_next_actions` | `crm_next_actions_no_truncate` |
| `private.crm_contact_task_credits` | `crm_contact_credits_no_delete` |
| `private.crm_contact_task_credits` | `crm_contact_credits_no_truncate` |
| `private.crm_contact_facts` | `crm_contact_facts_references` |
| `private.crm_contact_task_credits` | `crm_contact_credits_references` |
| `private.crm_contact_runtime` | `crm_contact_runtime_references` |
| `public.lead_crm` | `a00_crm_contact_fence` |
| `public.lead_contact_tasks` | `a00_crm_contact_fence` |
| `public.lead_contact_sequences` | `a00_crm_contact_fence` |
| `public.lead_crm` | `a00_crm_contact_truncate` |
| `public.lead_contact_tasks` | `a00_crm_contact_truncate` |
| `public.lead_contact_sequences` | `a00_crm_contact_truncate` |
| `public.leads` | `a00_crm_contact_truncate` |
| `public.leads` | `a00_crm_contact_restriction` |
| `public.customers` | `a00_crm_contact_customer_restriction` |
| `public.customers` | `a00_crm_contact_truncate` |

Las definiciones completas de triggers, las cinco policies, las ACL y los propietarios están en el JSON de catálogo. Constraints, FKs e índices se instalan desde los SQL completos; B01 comprueba convalidated/indisvalid/indisready y la matriz funcional prueba rechazo y atomicidad.

No hay roles nuevos: la membresía final postgres→crm_runtime_owner queda INHERIT=false/SET=false. Los helpers de efectos postgres reciben sólo SELECT interno, INSERT de hechos/acciones/créditos/eventos y UPDATE de runtime B/acciones/créditos. El runtime owner no recibe DML amplio sobre tablas legacy. Las membresías temporales de DDL están dentro de transacciones y se cierran al commit.
