import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync('supabase/migrations/20260909181500_recall_reactivation_assignment_order.sql', 'utf8');

test('seller-change trigger delegates only recall_reactivated to the Recall RPC', () => {
  assert.match(sql, /old\.assigned_seller_user_id is distinct from new\.assigned_seller_user_id/);
  assert.match(sql, /coalesce\(new\.routing_reason, ''\) <> 'recall_reactivated'/);
});

test('normal assignment, transfer and authorized reactivation logic remains present', () => {
  assert.match(sql, /new\.routing_reason = 'authorized_reactivation'/);
  assert.match(sql, /old\.assigned_seller_user_id is null/);
  assert.match(sql, /'transfer'/);
});

test('migration does not disable or drop the assignment trigger', () => {
  assert.doesNotMatch(sql, /disable\s+trigger|drop\s+trigger/i);
  assert.match(sql, /create or replace function private\.start_contact_sequence_after_assignment\(\)/i);
});
