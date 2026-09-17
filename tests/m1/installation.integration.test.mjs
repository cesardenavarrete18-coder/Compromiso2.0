import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { PgSession, TIMEOUT_SCALE, sqlLiteral as q } from './harness/pg-session.mjs';

// The launcher recognizes this filename: a FRESH cluster with bootstrap.sql,
// without any M1 migration. These tests execute the checked-in files VERBATIM,
// including their BEGIN/COMMIT, as a NOSUPERUSER PostgreSQL 17 administrator.
const MIGRATIONS = [
  '20260917154844_m1_runtime_authority_foundation.sql',
  '20260917154854_m1_private_capabilities.sql',
  '20260917154905_m1_command_receipts_events.sql',
];
const FOUR = ['crm_conversation_state', 'crm_lead_runtime', 'crm_runtime_gates', 'crm_runtime_policies'];
const SIX = [...FOUR, 'crm_command_receipts', 'crm_events'].sort();

async function migrate(db, index, expectedError = null) {
  assert.ok(process.env.M1_TEST_MIGRATION_DIR, 'launcher must provide immutable migration copies');
  const source = await readFile(path.join(process.env.M1_TEST_MIGRATION_DIR, MIGRATIONS[index]), 'utf8');
  await db.query('SET SESSION AUTHORIZATION postgres');
  try {
    assert.deepEqual((await db.query(`SELECT current_user,session_user,
      (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)`)).rows, [['postgres', 'postgres', 'f']]);
    const result = await db.query(source, { allowError: true });
    if (expectedError) {
      assert.equal(result.ok, false);
      assert.equal(result.sqlstate, expectedError);
      // A failed migration may leave its transaction aborted. The harness must
      // explicitly roll it back before inspecting catalogs or trying again.
      await db.query('ROLLBACK');
    } else {
      assert.equal(result.ok, true, `${MIGRATIONS[index]}: ${result.sqlstate}: ${result.error}`);
      assert.deepEqual((await db.query('SELECT current_user,session_user')).rows, [['postgres', 'postgres']]);
    }
  } finally {
    await db.query('ROLLBACK', { allowError: true });
    await db.query('RESET SESSION AUTHORIZATION');
  }
}

async function tables(db) {
  return (await db.query(`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='private' AND c.relkind='r' ORDER BY c.relname`)).rows.map(row => row[0]);
}

async function membership(db) {
  assert.equal(await db.scalar(`SELECT count(*) FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid
    WHERE r.rolname='crm_runtime_owner' AND (m.inherit_option OR m.set_option)`), '0');
  return (await db.query(`SELECT member.rolname,bool_or(m.admin_option),bool_or(m.inherit_option),bool_or(m.set_option)
    FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid JOIN pg_roles member ON member.oid=m.member
    WHERE r.rolname='crm_runtime_owner' GROUP BY member.rolname ORDER BY member.rolname`)).rows;
}

async function legacyDefinition(db) {
  return db.json(`SELECT jsonb_agg(jsonb_build_object('name',c.relname,'owner',r.rolname,'acl',c.relacl,
    'rls',c.relrowsecurity,'forced',c.relforcerowsecurity,
    'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.policyname) FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=c.relname),
    'triggers',(SELECT jsonb_agg(pg_get_triggerdef(t.oid) ORDER BY t.tgname) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal))
    ORDER BY c.relname)
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner
    WHERE n.nspname='public' AND c.relname IN ('profiles','leads')`);
}

async function assertClosed(db, names, owner) {
  assert.deepEqual(await tables(db), names);
  for (const name of names) {
    assert.deepEqual((await db.query(`SELECT r.rolname,c.relrowsecurity,c.relforcerowsecurity
      FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner WHERE c.oid=${q(`private.${name}`)}::regclass`)).rows,
    [[owner, 't', 't']]);
    assert.equal(await db.scalar(`SELECT count(*) FROM private.${name}`), '0');
    for (const role of ['anon', 'authenticated', 'service_role']) {
      assert.equal(await db.scalar(`SELECT has_table_privilege(${q(role)},${q(`private.${name}`)},'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')`), 'f');
    }
  }
  for (const role of ['anon', 'authenticated', 'service_role']) {
    await db.query(`SET SESSION AUTHORIZATION ${role}`);
    try {
      for (const name of names) {
        assert.equal((await db.query(`SELECT * FROM private.${name}`, { allowError: true })).sqlstate, '42501');
        assert.equal((await db.query(`DELETE FROM private.${name}`, { allowError: true })).sqlstate, '42501');
      }
    } finally { await db.query('RESET SESSION AUTHORIZATION'); }
  }
}

test('M1 installation: exact files, clean failures and closed partial states', { timeout: 120000 * TIMEOUT_SCALE }, async t => {
  const db = new PgSession('m1-installation');
  try {
    const baseline = await legacyDefinition(db);
    await t.test('I00: fresh relevant schema only, with no M1 role, gateway or tables', async () => {
      assert.equal(await db.scalar(`SELECT current_setting('server_version_num')::integer/10000`), '17');
      assert.deepEqual(await tables(db), []);
      assert.equal(await db.scalar(`SELECT count(*) FROM pg_roles WHERE rolname='crm_runtime_owner'`), '0');
      assert.equal(await db.scalar(`SELECT to_regprocedure('public.crm_submit_command(jsonb)')`), null);
    });

    await t.test('I01: 02 and 03 without predecessors fail and leave no role, schema grant or object', async () => {
      await migrate(db, 1, '42P01');
      assert.deepEqual(await tables(db), []);
      assert.equal(await db.scalar(`SELECT count(*) FROM pg_roles WHERE rolname='crm_runtime_owner'`), '0');
      await migrate(db, 2, '42704');
      assert.deepEqual(await tables(db), []);
      assert.equal(await db.scalar(`SELECT count(*) FROM pg_roles WHERE rolname='crm_runtime_owner'`), '0');
      assert.deepEqual(await legacyDefinition(db), baseline);
    });

    await t.test('I02: 01 preflight rejects an absent required legacy relation before creating anything', async () => {
      // Only the synthetic compatibility table is renamed, then restored.
      await db.query('ALTER TABLE public.leads RENAME TO fixture_leads_held');
      try {
        await migrate(db, 0, 'P0001');
        assert.deepEqual(await tables(db), []);
        assert.equal(await db.scalar(`SELECT to_regprocedure('private.crm_reject_policy_mutation()')`), null);
      } finally { await db.query('ALTER TABLE public.fixture_leads_held RENAME TO leads'); }
      assert.deepEqual(await legacyDefinition(db), baseline);
    });

    await t.test('I03: 01 alone commits four empty tables, FORCE RLS and no API permission', async () => {
      await migrate(db, 0);
      await assertClosed(db, FOUR, 'postgres');
      assert.equal(await db.scalar(`SELECT count(*) FROM pg_policies WHERE schemaname='private'`), '0');
      assert.equal(await db.scalar(`SELECT to_regprocedure('public.crm_submit_command(jsonb)')`), null);
      assert.equal(await db.scalar(`SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
        JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='private' AND NOT t.tgisinternal`), '2');
    });

    await t.test('I04: 03 after only 01 fails without making the partial installation usable', async () => {
      await migrate(db, 2, '42704');
      await assertClosed(db, FOUR, 'postgres');
      assert.equal(await db.scalar(`SELECT count(*) FROM pg_roles WHERE rolname='crm_runtime_owner'`), '0');
      assert.equal(await db.scalar(`SELECT to_regprocedure('public.crm_submit_command(jsonb)')`), null);
    });

    await t.test('I05: 02 transfers only new ownership and removes temporary CREATE/SET/INHERIT', async () => {
      await migrate(db, 1);
      await assertClosed(db, FOUR, 'crm_runtime_owner');
      assert.deepEqual(await membership(db), [['postgres', 't', 'f', 'f']]);
      assert.equal(await db.scalar(`SELECT has_schema_privilege('crm_runtime_owner','private','CREATE')`), 'f');
      assert.equal(await db.scalar(`SELECT count(*) FROM pg_policies WHERE schemaname='private' AND roles=ARRAY['crm_runtime_owner']::name[]`), '4');
      for (const table of ['profiles', 'leads']) {
        assert.equal(await db.scalar(`SELECT has_table_privilege('crm_runtime_owner',${q(`public.${table}`)},'SELECT,INSERT,UPDATE,DELETE,REFERENCES')`), 'f');
      }
      await migrate(db, 1, '42710');
      assert.deepEqual(await membership(db), [['postgres', 't', 'f', 'f']]);
      assert.deepEqual(await legacyDefinition(db), baseline);
    });

    await t.test('I06: a dependency failure in 03 rolls back its temporary membership and schema grants', async () => {
      await db.query('ALTER TABLE private.crm_runtime_policies RENAME TO fixture_policies_held');
      try { await migrate(db, 2, '42P01'); }
      finally { await db.query('ALTER TABLE private.fixture_policies_held RENAME TO crm_runtime_policies'); }
      assert.deepEqual(await membership(db), [['postgres', 't', 'f', 'f']]);
      for (const schema of ['private', 'public']) {
        assert.equal(await db.scalar(`SELECT has_schema_privilege('crm_runtime_owner',${q(schema)},'CREATE')`), 'f');
      }
      await assertClosed(db, FOUR, 'crm_runtime_owner');
      assert.equal(await db.scalar(`SELECT to_regprocedure('public.crm_submit_command(jsonb)')`), null);
      assert.deepEqual(await legacyDefinition(db), baseline);
    });

    await t.test('I07: 01->02->03 commits six closed tables with validated constraints/indexes and expected trigger graph', async () => {
      await migrate(db, 2);
      await assertClosed(db, SIX, 'crm_runtime_owner');
      assert.deepEqual(await membership(db), [['postgres', 't', 'f', 'f']]);
      assert.equal(await db.scalar(`SELECT count(*) FROM pg_policies WHERE schemaname='private' AND roles=ARRAY['crm_runtime_owner']::name[]`), '6');
      assert.equal(await db.scalar(`SELECT count(*) FROM pg_constraint k JOIN pg_namespace n ON n.oid=k.connamespace
        WHERE n.nspname='private' AND NOT k.convalidated`), '0');
      assert.equal(await db.scalar(`SELECT count(*) FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid
        JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='private' AND (NOT i.indisvalid OR NOT i.indisready)`), '0');
      assert.deepEqual((await db.query(`SELECT t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
        JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='private' AND NOT t.tgisinternal ORDER BY t.tgname`)).rows.map(row => row[0]), [
        'crm_event_append_only_guard', 'crm_event_receipt_decided_guard', 'crm_events_no_truncate',
        'crm_receipt_decided_guard', 'crm_receipt_terminal_guard', 'crm_receipts_no_truncate',
        'crm_runtime_policies_immutable', 'crm_runtime_policies_no_truncate',
      ]);
      assert.equal(await db.scalar(`SELECT count(*) FROM pg_trigger WHERE tgname IN ('crm_receipt_decided_guard','crm_event_receipt_decided_guard')
        AND tgdeferrable AND tginitdeferred`), '2');
      for (const role of ['anon', 'authenticated', 'service_role']) {
        await db.query(`SET SESSION AUTHORIZATION ${role}`);
        try {
          assert.equal((await db.query('SELECT public.crm_submit_command(null)', { allowError: true })).sqlstate, '42501');
        } finally { await db.query('RESET SESSION AUTHORIZATION'); }
      }
      assert.deepEqual(await legacyDefinition(db), baseline);
    });

    await t.test('I08: accidentally applying 03 twice fails transactionally, without changing the installed state', async () => {
      const before = await db.json(`SELECT jsonb_agg(jsonb_build_object('name',p.proname,'definition',pg_get_functiondef(p.oid)) ORDER BY p.proname)
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname LIKE 'crm_%'`);
      await migrate(db, 2, '42P07');
      assert.deepEqual(await membership(db), [['postgres', 't', 'f', 'f']]);
      await assertClosed(db, SIX, 'crm_runtime_owner');
      assert.deepEqual(await db.json(`SELECT jsonb_agg(jsonb_build_object('name',p.proname,'definition',pg_get_functiondef(p.oid)) ORDER BY p.proname)
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname LIKE 'crm_%'`), before);
      assert.deepEqual(await legacyDefinition(db), baseline);
    });
  } finally { await db.close(); }
});
