import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { configureSupabase } from "../scripts/configure-supabase-preview.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const productionConfigPath = path.join(repositoryRoot, "vendedores/supabase-config.js");
const QA_URL = "https://lygtmfvmdyjfiosnfwbp.supabase.co";

async function withConfigCopy(run) {
  const root = await mkdtemp(path.join(tmpdir(), "grupo-sur-preview-"));
  const targetDirectory = path.join(root, "vendedores");
  await mkdir(targetDirectory);
  await writeFile(path.join(targetDirectory, "supabase-config.js"), await readFile(productionConfigPath, "utf8"));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("Production preserves the committed Supabase configuration byte for byte", async () => {
  await withConfigCopy(async (root) => {
    const configPath = path.join(root, "vendedores/supabase-config.js");
    const before = await readFile(configPath, "utf8");
    const result = await configureSupabase({ env: { VERCEL: "1", VERCEL_ENV: "production" }, root });

    assert.equal(result.changed, false);
    assert.equal(await readFile(configPath, "utf8"), before);
  });
});

test("Preview injects only the explicit isolated QA configuration", async () => {
  await withConfigCopy(async (root) => {
    const configPath = path.join(root, "vendedores/supabase-config.js");
    const productionSource = await readFile(configPath, "utf8");
    const productionUrl = productionSource.match(/url: "([^"]+)"/)[1];
    const productionKey = productionSource.match(/publishableKey: "([^"]+)"/)[1];
    const previewKey = "sb_publishable_test_from_vercel_environment";

    const result = await configureSupabase({
      env: {
        VERCEL: "1",
        VERCEL_ENV: "preview",
        SUPABASE_URL: QA_URL,
        SUPABASE_PUBLISHABLE_KEY: previewKey
      },
      root
    });
    const generated = await readFile(configPath, "utf8");

    assert.equal(result.changed, true);
    assert.match(generated, new RegExp(`url: "${QA_URL}"`));
    assert.match(generated, new RegExp(`publishableKey: "${previewKey}"`));
    assert.doesNotMatch(generated, new RegExp(productionUrl));
    assert.doesNotMatch(generated, new RegExp(productionKey));
  });
});

test("Preview without either required variable fails without modifying Production config", async () => {
  for (const env of [
    { VERCEL: "1", VERCEL_ENV: "preview", SUPABASE_PUBLISHABLE_KEY: "test-key" },
    { VERCEL: "1", VERCEL_ENV: "preview", SUPABASE_URL: QA_URL }
  ]) {
    await withConfigCopy(async (root) => {
      const configPath = path.join(root, "vendedores/supabase-config.js");
      const before = await readFile(configPath, "utf8");

      await assert.rejects(() => configureSupabase({ env, root }), /Preview requires SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY/);
      assert.equal(await readFile(configPath, "utf8"), before);
    });
  }
});

test("Preview rejects a URL for any project other than isolated QA", async () => {
  await withConfigCopy(async (root) => {
    await assert.rejects(
      () => configureSupabase({
        env: {
          VERCEL: "1",
          VERCEL_ENV: "preview",
          SUPABASE_URL: "https://cdtvuovsqwwopktdahgj.supabase.co",
          SUPABASE_PUBLISHABLE_KEY: "test-key"
        },
        root
      }),
      /must point exactly to the isolated QA project/
    );
  });
});
