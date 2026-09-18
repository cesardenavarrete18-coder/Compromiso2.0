import assert from 'node:assert/strict';
assert.ok(process.env.M1_TEST_CONTACT_REGRESSION_MIGRATIONS,'Explicit post-B regression profile required');
await import('./assignment-runtime.integration.test.mjs');
