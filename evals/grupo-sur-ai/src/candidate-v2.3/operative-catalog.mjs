import { readFileSync } from "node:fs";

// The frozen deployed-runtime snapshot is the catalog authority for this
// offline candidate. Parse its structured advertisedVehicles tuples instead
// of maintaining a candidate-specific model list.
const sourceUrl = new URL("../../snapshot/runtime_source/index.ts", import.meta.url);
const source = readFileSync(sourceUrl, "utf8");
const start = source.indexOf("const advertisedVehicles = [");
const end = source.indexOf("] as const;", start);
if (start < 0 || end < 0) throw new Error("OPERATIVE_VEHICLE_CATALOG_NOT_FOUND");
const block = source.slice(start, end);
export const OPERATIVE_VEHICLE_CATALOG = Object.freeze(
  [...block.matchAll(/\[\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\]/g)].map(([, alias, canonical]) => Object.freeze([alias, canonical])),
);
if (!OPERATIVE_VEHICLE_CATALOG.length) throw new Error("OPERATIVE_VEHICLE_CATALOG_EMPTY");
export const OPERATIVE_VEHICLE_CATALOG_SOURCE = "evals/grupo-sur-ai/snapshot/runtime_source/index.ts#advertisedVehicles";
