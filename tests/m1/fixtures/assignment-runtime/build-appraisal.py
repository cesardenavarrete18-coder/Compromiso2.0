"""Generate the optional appraisal fixture from a SELECT-only schema capture.

No database/network access, no edits to the assignment or channel overlays.
"""
import hashlib
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
SOURCE = HERE / "appraisal-source.json"
data = json.loads(SOURCE.read_text())
app = data["catalog"]["snapshot"]
base = json.loads((HERE.parent / "schema-baseline-b/source.json").read_text())
main = json.loads((HERE / "source.json").read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def ident(value):
    return '"' + value.replace('"', '""') + '"'


def qualified(schema, name):
    return ident(schema) + "." + ident(name)


assert sha(HERE / "overlay.sql") == data["provenance"]["main_overlay_sha256"]
assert sha(HERE.parent / "schema-baseline-b/bootstrap.sql") == data["provenance"]["base_bootstrap_sha256"]
assert len(app["tables"]) == 1 and app["tables"][0]["name"] == "vehicle_appraisals"
assert not app["sequences"], "New sequence requires explicit restoration support"
assert len(app["functions"]) == 1 and app["functions"][0]["name"] == "save_lead_vehicle_appraisal"
table = app["tables"][0]
function = app["functions"][0]
assert table["kind"] == "r" and table["persistence"] == "p" and table["options"] is None
assert hashlib.sha256(function["definition"].encode()).hexdigest() == function["sha256"]
assert not re.search(r"net\.http|http_post|dblink|vault\.|cron\.", function["definition"], re.I)

base_app = base["application"]["snapshot"]
known = {t["schema"] + "." + t["name"] for t in base_app["tables"] + app["tables"]}
known |= {f["schema"] + "." + f["name"] for f in base_app["functions"] + main["functions_from_m0"]["data"] + app["functions"]}
references = set(re.findall(r"\b(?:public|private|auth)\.[a-z_][a-z_0-9]*", function["definition"]))
references |= {t["function_schema"] + "." + t["function_name"] for t in app["triggers"] or []}
for policy in app["policies"] or []:
    references |= set(re.findall(r"\b(?:public|private|auth)\.[a-z_][a-z_0-9]*", (policy["qual"] or "") + (policy["with_check"] or "")))
assert references <= known, "Uncaptured dependencies: " + repr(sorted(references - known))

roles = [r["name"] for r in base["security"]["snapshot"]["roles"] if r["name"] != "pg_database_owner"]
privileges = {"TABLE": {"a": "INSERT", "r": "SELECT", "w": "UPDATE", "d": "DELETE", "D": "TRUNCATE", "x": "REFERENCES", "t": "TRIGGER", "m": "MAINTAIN"}, "FUNCTION": {"X": "EXECUTE"}}


def restore_acl(kind, target, acl):
    assert acl is not None and acl.startswith("{") and acl.endswith("}")
    statements = [f"REVOKE ALL ON {kind} {target} FROM PUBLIC, " + ", ".join(ident(r) for r in roles) + ";"]
    for entry in acl[1:-1].split(",") if acl != "{}" else []:
        match = re.fullmatch(r"([a-zA-Z_0-9]*)=([A-Za-z*]*)/([a-zA-Z_0-9]+)", entry)
        assert match, "Unrepresented ACL syntax: " + entry
        grantee, codes, grantor = match.groups()
        assert grantor == "postgres", "Unexpected grantor requires dependency capture"
        role = ident(grantee) if grantee else "PUBLIC"
        for code, grantable in re.findall(r"([A-Za-z])(\*?)", codes):
            statements.append(f"GRANT {privileges[kind][code]} ON {kind} {target} TO {role}" + (" WITH GRANT OPTION" if grantable else "") + ";")
    return statements


lines = [
    "-- GENERATED OPTIONAL TEST FIXTURE. Not a product migration or appraisal redesign.",
    "-- Apply only in the isolated harness after B and assignment-runtime/overlay.sql.",
    "BEGIN;", "SET LOCAL ROLE postgres;", "SET LOCAL search_path = public, extensions;",
    "SET LOCAL check_function_bodies = off;",
]
target = qualified(table["schema"], table["name"])
columns = []
for column in app["columns"]:
    assert not column["identity"] and not column["generated"] and column["acl"] is None
    assert column["collation"] in (None, '"default"')
    item = ident(column["name"]) + " " + column["type"]
    if column["not_null"]:
        item += " NOT NULL"
    if column["default"] is not None:
        item += " DEFAULT " + column["default"]
    columns.append("  " + item)
lines += [f"CREATE TABLE {target} (\n" + ",\n".join(columns) + "\n);", f'ALTER TABLE {target} OWNER TO {ident(table["owner"])};']
for constraint in sorted(app["constraints"], key=lambda c: (c["type"] == "f", c["name"])):
    lines.append(f'ALTER TABLE {target} ADD CONSTRAINT {ident(constraint["name"])} {constraint["definition"]};')
for index in app["indexes"]:
    assert index["valid"] and index["ready"]
    if index["constraint_name"] is None:
        lines.append(index["definition"] + ";")
function_target = qualified(function["schema"], function["name"]) + "(" + function["arguments"] + ")"
lines += [function["definition"].rstrip() + ";", f'ALTER FUNCTION {function_target} OWNER TO {ident(function["owner"])};']
for trigger in app["triggers"] or []:
    lines.append(trigger["definition"] + ";")
    if trigger["enabled"] != "O":
        action = {"D": "DISABLE", "R": "ENABLE REPLICA", "A": "ENABLE ALWAYS"}[trigger["enabled"]]
        lines.append(f'ALTER TABLE {target} {action} TRIGGER {ident(trigger["name"])};')
for policy in app["policies"] or []:
    statement = f'CREATE POLICY {ident(policy["policyname"])} ON {target} AS {policy["permissive"]} FOR {policy["cmd"]} TO '
    statement += ", ".join("PUBLIC" if r == "public" else ident(r) for r in policy["roles"])
    if policy["qual"] is not None:
        statement += " USING (" + policy["qual"] + ")"
    if policy["with_check"] is not None:
        statement += " WITH CHECK (" + policy["with_check"] + ")"
    lines.append(statement + ";")
if table["rls_enabled"]:
    lines.append(f"ALTER TABLE {target} ENABLE ROW LEVEL SECURITY;")
if table["rls_forced"]:
    lines.append(f"ALTER TABLE {target} FORCE ROW LEVEL SECURITY;")
lines += restore_acl("TABLE", target, table["acl"])
lines += restore_acl("FUNCTION", function_target, function["acl"])
lines += ["SET LOCAL check_function_bodies = on;", "COMMIT;"]
sql = "\n\n".join(lines) + "\n"
(HERE / "appraisal-overlay.sql").write_text(sql)
manifest = {
    "schema": "crm.m1.assignment-appraisal-fixture/1",
    "classification": "OPTIONAL_SCHEMA_ONLY_FIXTURE_NOT_ACCEPTANCE_OR_DEPLOYMENT",
    "captured_at": app["captured_at"],
    "source_sha256": sha(SOURCE), "build_sha256": sha(Path(__file__)),
    "overlay_sha256": hashlib.sha256(sql.encode()).hexdigest(),
    "base_bootstrap_sha256": data["provenance"]["base_bootstrap_sha256"],
    "main_overlay_sha256": data["provenance"]["main_overlay_sha256"],
    "counts": {k: len(app[k] or []) for k in ["tables", "columns", "constraints", "indexes", "triggers", "policies", "functions", "sequences"]},
    "data_rows": 0,
    "function": {"signature": function["schema"] + "." + function["name"] + "(" + function["arguments"] + ")", "sha256": function["sha256"], "owner": function["owner"], "acl": function["acl"]},
    "qualified_dependencies": sorted(references),
    "m0_function_comparison": data["provenance"]["m0_comparison"],
    "generation_status": "GENERATED_ONLY_NOT_EXECUTED_BY_BUILDER",
    "limitations": [
        "Legacy owner authorization and upsert body are preserved verbatim; this is not a repaired function.",
        "Optional overlay does not alter principal assignment/channel fixtures or foundation B.",
        "No live appraisals, provider calls, market-reference Edge Function or credentials included.",
        "Real PostgreSQL execution is required to prove ownership guarding and concurrency behavior.",
    ],
}
(HERE / "appraisal-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({"generated": "appraisal-overlay.sql", "sha256": manifest["overlay_sha256"], "counts": manifest["counts"]}))
