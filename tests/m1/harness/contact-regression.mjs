import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { TIMEOUT_SCALE } from './pg-session.mjs';

// Explicit additional regression profile only. Original suites retain their
// original migration set and every assertion. This hook installs B after the
// A installation assertion, before any A command/channel behavior is exercised.
export async function installContactRegression(db, t) {
  const encoded=process.env.M1_TEST_CONTACT_REGRESSION_MIGRATIONS;
  if(encoded===undefined)return;
  const files=JSON.parse(encoded);
  assert.deepEqual(files,[
    '20260918160432_m1_contact_runtime_foundation.sql',
    '20260918160433_m1_contact_legacy_fences.sql',
    '20260918160434_m1_contact_commands.sql',
  ]);
  await db.query('SET SESSION AUTHORIZATION postgres');
  try{
    assert.equal(await db.scalar('SELECT rolsuper FROM pg_roles WHERE rolname=current_user'),'f');
    await db.query(await readFile(new URL('../fixtures/contact-runtime/legacy-writers-overlay.sql',import.meta.url),'utf8'),{timeout:60000*TIMEOUT_SCALE});
    for(const name of files){
      const bytes=await readFile(path.join(process.env.M1_TEST_MIGRATION_DIR,name));
      await db.query(bytes.toString(),{timeout:60000*TIMEOUT_SCALE});
      t.diagnostic(JSON.stringify({contact_regression_migration:name,sha256:createHash('sha256').update(bytes).digest('hex'),installed_as:'postgres'}));
    }
    assert.equal(await db.scalar("SELECT has_function_privilege('authenticated','public.crm_submit_command(jsonb)','EXECUTE')"),'f');
    assert.equal(await db.scalar('SELECT count(*) FROM private.crm_contact_next_action_adoptions'),'0');
  }finally{
    await db.query('ROLLBACK',{allowError:true});
    await db.query('RESET SESSION AUTHORIZATION');
  }
}
