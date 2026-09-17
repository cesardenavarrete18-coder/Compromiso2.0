import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { PgSession, TIMEOUT_SCALE, sqlLiteral as q } from './harness/pg-session.mjs';

// This filename selects a fresh B cluster, bootstrapped by supabase_admin (OID10).
// No bootstrap A, test handler, business rows or broad fixture grants are used.
const sourceUrl = new URL('./fixtures/schema-baseline-b/source.json', import.meta.url);
const sourceBytes = await readFile(sourceUrl);
const source = JSON.parse(sourceBytes);
const manifest = JSON.parse(await readFile(new URL('./fixtures/schema-baseline-b/manifest.json', import.meta.url)));
const MIGRATIONS = [
  '20260917154844_m1_runtime_authority_foundation.sql',
  '20260917154854_m1_private_capabilities.sql',
  '20260917154905_m1_command_receipts_events.sql',
];
const SIX = ['crm_command_receipts', 'crm_conversation_state', 'crm_events', 'crm_lead_runtime', 'crm_runtime_gates', 'crm_runtime_policies'];
const sha = value => createHash('sha256').update(value).digest('hex');
const qualified = (schema, name) => `"${schema.replaceAll('"', '""')}"."${name.replaceAll('"', '""')}"`;

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])]));
  return value;
}

function catalog(snapshot) {
  // Catalog collections and ACL entries are sets. Role OIDs are deliberately
  // absent from these equality checks; owners, grantors and privileges remain.
  // Column ordinal, enum order and sequence bigint strings are NOT discarded.
  const result = {};
  for (const [key, raw] of Object.entries(snapshot)) {
    if (key === 'captured_at') continue;
    const normalize = object => {
      const value = stable(object);
      if (value && typeof value === 'object' && typeof value.acl === 'string') {
        value.acl = '{' + value.acl.slice(1, -1).split(',').sort().join(',') + '}';
      }
      return value;
    };
    result[key] = Array.isArray(raw)
      ? raw.map(normalize).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), 'en'))
      : normalize(raw);
  }
  return result;
}

async function snapshot(db) {
  await db.query('SET search_path = public, extensions');
  return catalog(await db.json(source.application.query));
}

async function assertEmpty(db, relations) {
  for (const relation of relations) {
    const name = qualified(relation.schema, relation.name);
    assert.equal(await db.scalar(`SELECT count(*) FROM ${name}`), '0', `${name} must remain data-free`);
  }
}

test('B: observed relevant schema, exact M1 DDL, unchanged legacy catalogs and closed authority', { timeout: 240000 * TIMEOUT_SCALE }, async t => {
  const db = new PgSession('m1-schema-baseline-b');
  let before;
  try {
    await t.test('B00: source integrity and real bootstrap identity are prerequisites', async () => {
      assert.equal(sha(sourceBytes), manifest.source_sha256);
      const bootstrap = await readFile(new URL('./fixtures/schema-baseline-b/bootstrap.sql', import.meta.url));
      assert.equal(sha(bootstrap), manifest.bootstrap_sha256);
      assert.deepEqual((await db.query(`SELECT rolname,oid=10,rolsuper FROM pg_roles
        WHERE rolname IN ('supabase_admin','postgres') ORDER BY rolname`)).rows,
      [['postgres', 'f', 'f'], ['supabase_admin', 't', 't']]);
      assert.equal(await db.scalar(`SELECT current_setting('server_version_num')::integer/10000`), '17');
      assert.equal(await db.scalar(`SELECT count(*) FROM pg_roles WHERE rolname='crm_runtime_owner'`), '0');
      assert.equal(await db.scalar(`SELECT to_regprocedure('public.crm_submit_command(jsonb)')`), null);
      assert.equal(await db.scalar(`SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()`), 'postgres');
    });

    await t.test('B01: observed tables, columns, constraints, indexes, triggers, policies, functions, sequences and enum match', async () => {
      before = await snapshot(db);
      assert.deepEqual(before, catalog(source.application.snapshot));
      await assertEmpty(db, source.application.snapshot.tables);
    });

    await t.test('B02: selected roles, membership grantors, schemas and default ACLs match', async () => {
      const actual = catalog(await db.json(source.security.query));
      const expected = catalog(source.security.snapshot);
      // Database-level platform grants are inventoried, deliberately outside
      // this relevant schema boundary (see manifest and documentation).
      delete actual.database_acl;
      delete expected.database_acl;
      assert.deepEqual(actual, expected);
    });

    await t.test('B03: captured auth.uid implementation honors real JWT claims precedence and malformed claims', async () => {
      const first = '10000000-0000-0000-0000-000000000001';
      const second = '20000000-0000-0000-0000-000000000002';
      await db.query('SET SESSION AUTHORIZATION authenticated');
      try {
        await db.query(`SELECT set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claims','',false)`);
        assert.equal(await db.scalar('SELECT auth.uid()'), null);
        await db.query(`SELECT set_config('request.jwt.claims',${q(JSON.stringify({ sub: first }))},false)`);
        assert.equal(await db.scalar('SELECT auth.uid()'), first);
        await db.query(`SELECT set_config('request.jwt.claim.sub',${q(second)},false)`);
        assert.equal(await db.scalar('SELECT auth.uid()'), second);
        await db.query(`SELECT set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claims','not-json',false)`);
        assert.equal((await db.query('SELECT auth.uid()', { allowError: true })).sqlstate, '22P02');
      } finally {
        await db.query(`SELECT set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claims','',false)`);
        await db.query('RESET SESSION AUTHORIZATION');
      }
    });

    for (const [index, filename] of MIGRATIONS.entries()) {
      await t.test(`B${index + 4}: ${filename} applies verbatim as postgres NOSUPERUSER and preserves observed objects`, async () => {
        assert.ok(process.env.M1_TEST_MIGRATION_DIR);
        const migration = await readFile(path.join(process.env.M1_TEST_MIGRATION_DIR, filename), 'utf8');
        await db.query('SET SESSION AUTHORIZATION postgres');
        try {
          assert.deepEqual((await db.query(`SELECT current_user,session_user,
            (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)`)).rows, [['postgres', 'postgres', 'f']]);
          const result = await db.query(migration, { allowError: true, timeout: 45000 * TIMEOUT_SCALE });
          assert.equal(result.ok, true, `${filename}: ${result.sqlstate}: ${result.error}`);
          assert.deepEqual((await db.query('SELECT current_user,session_user')).rows, [['postgres', 'postgres']]);
        } finally {
          await db.query('ROLLBACK', { allowError: true });
          await db.query('RESET SESSION AUTHORIZATION');
        }
        assert.deepEqual(await snapshot(db), before);
        await assertEmpty(db, source.application.snapshot.tables);
      });
    }

    await t.test('B07: six empty runtime tables are closed despite broad observed public-schema default grants', async () => {
      assert.deepEqual((await db.query(`SELECT c.relname,r.rolname,c.relrowsecurity,c.relforcerowsecurity
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner
        WHERE n.nspname='private' AND c.relkind='r' ORDER BY c.relname`)).rows,
      SIX.map(name => [name, 'crm_runtime_owner', 't', 't']));
      await assertEmpty(db, SIX.map(name => ({ schema: 'private', name })));
      for (const role of ['anon', 'authenticated', 'service_role']) {
        for (const name of SIX) {
          assert.equal(await db.scalar(`SELECT has_table_privilege(${q(role)},${q(`private.${name}`)},'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')`), 'f');
        }
        await db.query(`SET SESSION AUTHORIZATION ${role}`);
        try {
          assert.equal((await db.query('SELECT public.crm_submit_command(null)', { allowError: true })).sqlstate, '42501');
          for (const name of SIX) {
            assert.equal((await db.query(`SELECT * FROM private.${name}`, { allowError: true })).sqlstate, '42501');
            assert.equal((await db.query(`DELETE FROM private.${name}`, { allowError: true })).sqlstate, '42501');
          }
        } finally { await db.query('RESET SESSION AUTHORIZATION'); }
      }
    });

    await t.test('B08: installed handler remains closed and no legacy capabilities leak to the runtime owner', async () => {
      const result = await db.query(`SELECT private.crm_apply_foundation_probe(
        '00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','{}','{}')`, { allowError: true });
      assert.equal(result.sqlstate, 'P0103');
      assert.match(result.error, /COMMAND_NOT_IMPLEMENTED/);
      assert.deepEqual((await db.query(`SELECT m.rolname,bool_or(a.admin_option),bool_or(a.inherit_option),bool_or(a.set_option)
        FROM pg_auth_members a JOIN pg_roles r ON r.oid=a.roleid JOIN pg_roles m ON m.oid=a.member
        WHERE r.rolname='crm_runtime_owner' GROUP BY m.rolname ORDER BY m.rolname`)).rows,
      [['postgres', 't', 'f', 'f']]);
      for (const name of ['profiles', 'leads']) {
        assert.equal(await db.scalar(`SELECT has_table_privilege('crm_runtime_owner',${q(`public.${name}`)},'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')`), 'f');
      }
      for (const schema of ['private', 'public']) {
        assert.equal(await db.scalar(`SELECT has_schema_privilege('crm_runtime_owner',${q(schema)},'CREATE')`), 'f');
      }
      assert.deepEqual(await snapshot(db), before);
      await assertEmpty(db, [...source.application.snapshot.tables, ...SIX.map(name => ({ schema: 'private', name }))]);
    });
  } finally { await db.close(); }
});
