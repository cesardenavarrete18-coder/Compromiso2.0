import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const QA_PROJECT_REF = "lygtmfvmdyjfiosnfwbp";
const CONFIG_RELATIVE_PATH = "vendedores/supabase-config.js";
const CONFIG_PATTERN = /var config = Object\.freeze\(\{\s*url: "[^"]+",\s*publishableKey: "[^"]+"\s*\}\);/;

function fail(message) {
  throw new Error(`[supabase-preview] ${message}`);
}

function validatePreviewConfig(urlValue, publishableKey) {
  if (!urlValue || !publishableKey) {
    fail("Preview requires SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY; refusing to use the committed Production configuration.");
  }

  let url;
  try {
    url = new URL(urlValue);
  } catch {
    fail("SUPABASE_URL must be a valid URL.");
  }

  if (url.protocol !== "https:" || url.hostname !== `${QA_PROJECT_REF}.supabase.co` || url.pathname !== "/" || url.search || url.hash) {
    fail(`SUPABASE_URL must point exactly to the isolated QA project ${QA_PROJECT_REF}.`);
  }

  if (!publishableKey.trim()) {
    fail("SUPABASE_PUBLISHABLE_KEY cannot be blank.");
  }

  return { url: url.origin, publishableKey };
}

export async function configureSupabase({ env = process.env, root = process.cwd() } = {}) {
  const vercelEnvironment = env.VERCEL_ENV;

  if (vercelEnvironment === "production") {
    console.log("[supabase-preview] Production build: committed configuration left unchanged.");
    return { changed: false, environment: vercelEnvironment };
  }

  if (vercelEnvironment !== "preview") {
    if (env.VERCEL === "1") {
      fail(`Unsupported Vercel environment ${JSON.stringify(vercelEnvironment)}; refusing to build with the Production configuration.`);
    }
    console.log("[supabase-preview] Non-Vercel build: committed configuration left unchanged.");
    return { changed: false, environment: vercelEnvironment || "local" };
  }

  const config = validatePreviewConfig(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY);
  const configPath = path.join(root, CONFIG_RELATIVE_PATH);
  const source = await readFile(configPath, "utf8");
  if (!CONFIG_PATTERN.test(source)) {
    fail(`Could not locate the configuration block in ${CONFIG_RELATIVE_PATH}.`);
  }

  const generatedBlock = `var config = Object.freeze({\n    url: ${JSON.stringify(config.url)},\n    publishableKey: ${JSON.stringify(config.publishableKey)}\n  });`;
  const generatedSource = source.replace(CONFIG_PATTERN, generatedBlock);
  const temporaryPath = `${configPath}.preview-${process.pid}`;
  await writeFile(temporaryPath, generatedSource, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, configPath);

  console.log(`[supabase-preview] Preview configured for QA project ${QA_PROJECT_REF}.`);
  return { changed: true, environment: vercelEnvironment };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  configureSupabase().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
