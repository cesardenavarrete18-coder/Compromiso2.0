import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync('supabase/migrations/20260909180500_recall_crm_v2_compatibility.sql', 'utf8');

function has(pattern, message) {
  assert.match(sql, pattern, message);
}

test('canonical cold-base evidence requires 18 completed no-answer calls and 9 bands', () => {
  has(/count\(\*\) filter \(where task\.channel = 'call'\) = 18/);
  has(/task\.status = 'completed'[\s\S]*task\.outcome = 'no_answer'[\s\S]*\) = 18/);
  has(/count\(distinct \(task\.protocol_day, task\.protocol_band\)\)[\s\S]*= 9/);
  has(/count\(\*\) filter \(where task\.outcome = 'answered'\) = 0/);
});

test('database guard strips non-canonical cold_base_at writes', () => {
  has(/create trigger lead_crm_guard_canonical_cold_base/i);
  has(/before update of cold_base_at on public\.lead_crm/i);
  has(/new\.cold_base_at := null/);
  has(/new\.status <> 'desistir'/);
  has(/new\.status_reason is distinct from 'No contactado post protocolo'/);
});

test('historical cleanup removes marker only when canonical evidence is absent', () => {
  has(/update public\.lead_crm crm\s+set cold_base_at = null\s+where crm\.cold_base_at is not null\s+and not private\.lead_has_canonical_cold_base_evidence\(crm\.lead_id\)/i);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.(?:leads|customers|lead_recall_items|lead_recall_attempts)/i);
});

test('historical pending sale on Desistir is reconciled as rejected with canonical note', () => {
  has(/update public\.lead_sale_requests request[\s\S]*status = 'rejected'/i);
  has(/request\.status = 'pending'[\s\S]*crm\.status = 'desistir'/i);
  has(/Cancelada automáticamente: el cliente desistió antes de la confirmación administrativa/);
});

test('Recall answered requires a future agreed next contact and respects opt-out', () => {
  has(/if v_lead_do_not_contact or v_customer_do_not_contact then/i);
  has(/p_next_contact_at is null or p_next_contact_at <= now\(\)/i);
});

test('Recall answered opens or ensures a new CRM cycle before En Gestión', () => {
  has(/if v_crm_status <> 'nuevo' then[\s\S]*private\.start_lead_crm_cycle\(/i);
  has(/p_origin[\s\S]*recall_reactivation|['"]recall_reactivation['"]/i);
  has(/public\.record_lead_follow_up\([\s\S]*p_status => 'en_proceso'/i);
});

test('Recall answered preserves effective call time and cancels temporary protocol through canonical follow-up', () => {
  has(/last_contact_at = p_contacted_at/);
  has(/last_contact_outcome = 'Rellamado respondido'/);
  has(/public\.record_lead_follow_up/);
});

test('Recall exhaustion never creates Base fría', () => {
  has(/cold_base_at = null/);
  assert.doesNotMatch(sql, /cold_base_at\s*=\s*now\(\)/i);
  has(/'base_fria', false/);
});

test('Recall attempts fail closed if the Lead left Desistir or entered sales administration', () => {
  has(/if v_crm_status <> 'desistir' then/i);
  has(/exists \(select 1 from public\.sales_cases where lead_id = v_item\.lead_id\)/i);
});

test('migration is forward-only and reloads PostgREST schema', () => {
  assert.doesNotMatch(sql, /drop\s+table|truncate\s+table/i);
  has(/notify pgrst, 'reload schema'/i);
});
