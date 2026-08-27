import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

function criticalDelta(control, candidate) {
  const before = new Set(control.critical_failures || []); const after = new Set(candidate.critical_failures || []);
  return { eliminated: [...before].filter((item) => !after.has(item)), new: [...after].filter((item) => !before.has(item)) };
}

function classification(control, candidate, critical) {
  if (critical.new.length && !critical.eliminated.length) return "regression";
  if (critical.eliminated.length && !critical.new.length) return "improvement";
  if (candidate.score > control.score) return "improvement";
  if (candidate.score < control.score) return "regression";
  return "no_change";
}

export function comparePairedResults(controlPayload, candidatePayload) {
  const controlCases = new Map(controlPayload.cases.map((item) => [item.eval_id, item]));
  const candidateCases = new Map(candidatePayload.cases.map((item) => [item.eval_id, item]));
  if (controlCases.size !== 100 || candidateCases.size !== 100) throw new Error("AB_COMPARE_CASE_COUNT_MISMATCH");
  const cases = [];
  for (const evalId of [...controlCases.keys()].sort()) {
    const control = controlCases.get(evalId); const candidate = candidateCases.get(evalId);
    if (!candidate) throw new Error(`AB_COMPARE_CASE_MISSING:${evalId}`);
    const critical = criticalDelta(control, candidate);
    cases.push({
      eval_id: evalId, classification: classification(control, candidate, critical),
      official_score: { control: control.score, candidate: candidate.score, delta: Number((candidate.score - control.score).toFixed(2)) },
      normalized_existing_capabilities_score: {
        control: control.normalized_existing_capabilities_score,
        candidate: candidate.normalized_existing_capabilities_score,
        delta: Number((candidate.normalized_existing_capabilities_score - control.normalized_existing_capabilities_score).toFixed(2)),
      },
      official_pass: { control: control.official_pass, candidate: candidate.official_pass },
      existing_capabilities_pass: { control: control.existing_capabilities_pass, candidate: candidate.existing_capabilities_pass },
      critical_failures: critical,
      graders: Object.fromEntries(Object.keys(control.graders).map((name) => [name, {
        control: control.graders[name].score, candidate: candidate.graders[name].score,
        delta: Number((candidate.graders[name].score - control.graders[name].score).toFixed(4)),
        control_outcome: control.graders[name].outcome, candidate_outcome: candidate.graders[name].outcome,
      }])),
    });
  }
  const allEliminated = cases.flatMap((item) => item.critical_failures.eliminated.map((failure) => ({ eval_id: item.eval_id, failure })));
  const allNew = cases.flatMap((item) => item.critical_failures.new.map((failure) => ({ eval_id: item.eval_id, failure })));
  return {
    protocol: "grupo-sur-ai-ab-comparison-v1",
    control: controlPayload.summary,
    candidate: candidatePayload.summary,
    counts: {
      improved: cases.filter((item) => item.classification === "improvement").length,
      regressed: cases.filter((item) => item.classification === "regression").length,
      unchanged: cases.filter((item) => item.classification === "no_change").length,
      critical_failures_eliminated: allEliminated.length,
      critical_failures_new: allNew.length,
    },
    critical_failures: { eliminated: allEliminated, new: allNew },
    cases,
  };
}

function comparisonReport(comparison) {
  return `# Grupo Sur AI — comparación A/B v1\n\n| Resultado pareado | Casos |\n|---|---:|\n| Mejorados | ${comparison.counts.improved} |\n| Regresionados | ${comparison.counts.regressed} |\n| Sin cambio | ${comparison.counts.unchanged} |\n\n- Critical failures eliminados: **${comparison.counts.critical_failures_eliminated}**\n- Critical failures nuevos: **${comparison.counts.critical_failures_new}**\n- Control score: **${comparison.control.global.score}**\n- Candidate score: **${comparison.candidate.global.score}**\n\nEl Baseline v2 histórico 63.31 / 88.76 permanece separado y no fue sobrescrito.\n`;
}

export async function persistComparison({ directory, comparison }) {
  await mkdir(directory, { recursive: true });
  const comparisonJson = json(comparison); const report = comparisonReport(comparison);
  await writeFile(resolve(directory, "comparison.json"), comparisonJson, { flag: "wx" });
  await writeFile(resolve(directory, "comparison.md"), report, { flag: "wx" });
  const sums = `${sha256(comparisonJson)}  comparison.json\n${sha256(report)}  comparison.md\n`;
  await writeFile(resolve(directory, "SHA256SUMS.comparison"), sums, { flag: "wx" });
  return { comparison_json_sha256: sha256(comparisonJson), comparison_report_sha256: sha256(report) };
}
