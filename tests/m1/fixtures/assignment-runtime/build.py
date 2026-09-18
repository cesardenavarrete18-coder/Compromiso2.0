"""Build a data-free assignment overlay from checked-in catalogue evidence.

This script only reads/writes local files. It never opens a database or network.
It does not modify schema-baseline-b or the historical assignment-boundary fixture.
The resulting SQL is a test fixture, not a deployable migration.
"""
import hashlib
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
SOURCE = HERE / "source.json"
data = json.loads(SOURCE.read_text())
app = data["table_catalog"]["snapshot"]
functions = data["functions_from_m0"]["data"]
base_dir = HERE.parent / "schema-baseline-b"
base = json.loads((base_dir / "source.json").read_text())
base_app = base["application"]["snapshot"]
boundary_dir = HERE.parent / "assignment-boundary"


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


assert digest(base_dir / "bootstrap.sql") == data["provenance"]["base_bootstrap_sha256"]
assert digest(boundary_dir / "overlay.sql") == data["provenance"]["boundary_overlay_sha256"]
assert len(functions) == data["provenance"]["captured_function_count"]


def ident(value):
    return '"' + value.replace('"', '""') + '"'


def qualified(schema, name):
    return ident(schema) + "." + ident(name)


def function_target(function):
    return qualified(function["schema"], function["name"]) + "(" + function["arguments"] + ")"


def acl_entries(value):
    # All selected objects have explicit ACLs. A missing ACL must be handled
    # consciously, not confused with empty privileges or the local defaults.
    assert value is not None and value.startswith("{") and value.endswith("}"), value
    result = []
    for entry in value[1:-1].split(",") if value != "{}" else []:
        match = re.fullmatch(r"([a-zA-Z_0-9]*)=([A-Za-z*]*)/([a-zA-Z_0-9]+)", entry)
        assert match, "Unrepresented ACL syntax: " + entry
        grantee, codes, grantor = match.groups()
        result.append((grantee or "PUBLIC", grantor, re.findall(r"([A-Za-z])(\*?)", codes)))
    return result


privileges = {
    "TABLE": {"a": "INSERT", "r": "SELECT", "w": "UPDATE", "d": "DELETE", "D": "TRUNCATE", "x": "REFERENCES", "t": "TRIGGER", "m": "MAINTAIN"},
    "SEQUENCE": {"r": "SELECT", "w": "UPDATE", "U": "USAGE"},
    "FUNCTION": {"X": "EXECUTE"},
}
roles = [r["name"] for r in base["security"]["snapshot"]["roles"] if r["name"] != "pg_database_owner"]
grantees = ["PUBLIC", *roles]


def restore_acl(kind, target, value):
    result = [f"REVOKE ALL ON {kind} {target} FROM " + ", ".join(g if g == "PUBLIC" else ident(g) for g in grantees) + ";"]
    for grantee, grantor, permissions in acl_entries(value):
        assert grantor == "postgres", "Unexpected grantor: capture its role dependency first"
        result.append("SET LOCAL ROLE postgres;")
        for code, grantable in permissions:
            role = grantee if grantee == "PUBLIC" else ident(grantee)
            result.append(f"GRANT {privileges[kind][code]} ON {kind} {target} TO {role}" + (" WITH GRANT OPTION" if grantable else "") + ";")
    return result


base_functions = {(f["schema"], f["name"], f["arguments"]) for f in base_app["functions"]}
assert not any((f["schema"], f["name"], f["arguments"]) in base_functions for f in functions)
base_tables = {t["schema"] + "." + t["name"] for t in base_app["tables"]}
new_tables = {t["schema"] + "." + t["name"] for t in app["tables"]}
assert new_tables == {"public.lead_assignments"} and not base_tables.intersection(new_tables)
known_functions = {f["schema"] + "." + f["name"] for f in base_app["functions"] + functions}
known_relations = base_tables | new_tables
known_refs = known_relations | known_functions
dependencies = {}
for function in functions:
    definition = function["definition"]
    assert hashlib.sha256(definition.encode()).hexdigest() == function["definition_sha256"]
    assert not re.search(r"net\.http|http_post|dblink|vault\.|cron\.", definition, re.I)
    # The selected captured bodies use fully qualified application references.
    # This is a build-time missing-reference check, not a proof of SQL behavior.
    refs = set(re.findall(r"\b(?:public|private|auth)\.[a-z_][a-z_0-9]*", definition))
    missing = refs - known_refs
    assert not missing, f"Missing captured dependencies for {function['name']}: {sorted(missing)}"
    key = function["schema"] + "." + function["name"] + "(" + function["arguments"] + ")"
    dependencies[key] = sorted(refs - {function["schema"] + "." + function["name"]})

lines = [
    "-- GENERATED from source.json by build.py; TEST FIXTURE ONLY, NOT A MIGRATION.",
    "-- Apply after schema-baseline-b/bootstrap.sql and assignment-boundary/overlay.sql.",
    "-- No application/auth rows, sequence current values, jobs, secrets or provider calls.",
    "BEGIN;",
    "SET LOCAL ROLE postgres;",
    "SET LOCAL search_path = public, extensions;",
    "SET LOCAL check_function_bodies = off;",
    "DO $$ BEGIN IF current_setting('server_version_num')::integer < 170000 THEN RAISE EXCEPTION 'ASSIGNMENT_FIXTURE_REQUIRES_POSTGRES_17'; END IF; END $$;",
]

for table in app["tables"]:
    assert table["kind"] == "r" and table["persistence"] == "p" and table["options"] is None
    declarations = []
    for column in app["columns"]:
        assert (column["schema"], column["table"]) == (table["schema"], table["name"])
        assert column["collation"] in (None, '"default"') and column["acl"] is None
        declaration = ident(column["name"]) + " " + column["type"]
        if column["identity"]:
            sequence = next(s for s in app["sequences"] if (s["table_schema"], s["table"], s["column"]) == (column["schema"], column["table"], column["name"]))
            assert sequence["dependency_type"] == "i" and sequence["owner"] == table["owner"]
            mode = {"a": "ALWAYS", "d": "BY DEFAULT"}[column["identity"]]
            declaration += f' GENERATED {mode} AS IDENTITY (SEQUENCE NAME {qualified(sequence["schema"], sequence["name"])} START WITH {sequence["start"]} INCREMENT BY {sequence["increment"]} MINVALUE {sequence["minimum"]} MAXVALUE {sequence["maximum"]} CACHE {sequence["cache"]}'
            declaration += " CYCLE)" if sequence["cycle"] else " NO CYCLE)"
        else:
            assert not column["generated"], "Generated column requires explicit handling"
        if column["not_null"]:
            declaration += " NOT NULL"
        declarations.append("  " + declaration)
    target = qualified(table["schema"], table["name"])
    lines.append(f"CREATE TABLE {target} (\n" + ",\n".join(declarations) + "\n);")
    lines.append(f'ALTER TABLE {target} OWNER TO {ident(table["owner"])};')

for function in functions:
    lines.append(function["definition"].rstrip() + ";")
    lines.append(f'ALTER FUNCTION {function_target(function)} OWNER TO {ident(function["owner"])};')

for column in app["columns"]:
    if column["default"] is not None and not column["identity"]:
        lines.append(f'ALTER TABLE {qualified(column["schema"], column["table"])} ALTER COLUMN {ident(column["name"])} SET DEFAULT {column["default"]};')
for constraint in sorted(app["constraints"], key=lambda c: (c["type"] == "f", c["name"])):
    lines.append(f'ALTER TABLE {qualified(constraint["schema"], constraint["table"])} ADD CONSTRAINT {ident(constraint["name"])} {constraint["definition"]};')
for index in app["indexes"]:
    assert index["valid"] and index["ready"]
    if index["constraint_name"] is None:
        lines.append(index["definition"] + ";")
for trigger in app["triggers"] or []:
    lines.append(trigger["definition"] + ";")
    if trigger["enabled"] != "O":
        action = {"D": "DISABLE", "R": "ENABLE REPLICA", "A": "ENABLE ALWAYS"}[trigger["enabled"]]
        lines.append(f'ALTER TABLE {qualified(trigger["schema"], trigger["table"])} {action} TRIGGER {ident(trigger["name"])};')
for policy in app["policies"]:
    statement = f'CREATE POLICY {ident(policy["policyname"])} ON {qualified(policy["schemaname"], policy["tablename"])} AS {policy["permissive"]} FOR {policy["cmd"]} TO '
    statement += ", ".join("PUBLIC" if r == "public" else ident(r) for r in policy["roles"])
    if policy["qual"] is not None:
        statement += " USING (" + policy["qual"] + ")"
    if policy["with_check"] is not None:
        statement += " WITH CHECK (" + policy["with_check"] + ")"
    lines.append(statement + ";")
for table in app["tables"]:
    target = qualified(table["schema"], table["name"])
    if table["rls_enabled"]:
        lines.append(f"ALTER TABLE {target} ENABLE ROW LEVEL SECURITY;")
    if table["rls_forced"]:
        lines.append(f"ALTER TABLE {target} FORCE ROW LEVEL SECURITY;")
    lines += restore_acl("TABLE", target, table["acl"])
for sequence in app["sequences"]:
    lines += restore_acl("SEQUENCE", qualified(sequence["schema"], sequence["name"]), sequence["acl"])
for function in functions:
    lines += restore_acl("FUNCTION", function_target(function), function["acl"])
lines += ["SET LOCAL check_function_bodies = on;", "COMMIT;"]

sql = "\n\n".join(lines) + "\n"
(HERE / "overlay.sql").write_text(sql)
manifest = {
    "schema": "crm.m1.assignment-runtime-fixture/1",
    "classification": "SCHEMA_ONLY_FIXTURE_NOT_ACCEPTANCE_OR_DEPLOYMENT",
    "scope": "Legacy assignment/task-result/follow-up dependency closure over unchanged B; channel schema is a separately captured overlay.",
    "source_sha256": digest(SOURCE),
    "build_sha256": digest(Path(__file__)),
    "overlay_sha256": hashlib.sha256(sql.encode()).hexdigest(),
    "base_bootstrap_sha256": data["provenance"]["base_bootstrap_sha256"],
    "boundary_overlay_sha256": data["provenance"]["boundary_overlay_sha256"],
    "captures": {"functions_m0": data["functions_from_m0"]["captured_at"], "lead_assignments_catalog": app["captured_at"]},
    "counts": {**{k: len(app[k] or []) for k in ["tables", "columns", "constraints", "indexes", "sequences", "triggers", "policies"]}, "functions": len(functions), "data_rows": 0},
    "functions": [{"signature": f["schema"] + "." + f["name"] + "(" + f["arguments"] + ")", "sha256": f["definition_sha256"], "owner": f["owner"], "acl": f["acl"]} for f in functions],
    "dependencies": dependencies,
    "installation_order": ["schema-baseline-b/bootstrap.sql", "certified M1-01/02/03 (runner)", "assignment-boundary/overlay.sql", "assignment-runtime/overlay.sql", "assignment-runtime/channel-overlay.sql (separate capture)", "authorized candidate migrations (verbatim, isolated only)"],
    "generation_status": "GENERATED_ONLY_NOT_EXECUTED_BY_BUILDER",
    "limitations": [
        "M0 function capture and later table metadata are separate snapshots; not an atomic production dump.",
        "Observed function definitions, owners and ACLs are reproduced verbatim; no production/auth rows or sequence current value.",
        "B's relevant schema limits remain; this does not capture every CRM or external writer.",
        "Channel source/overlay are built separately and must be loaded to exercise human-mode legacy branches.",
        "No HTTP/Edge/provider implementation is included or certified by a database fixture.",
        "No AssignLead/TransferLead/Acknowledge behavior is implemented by this legacy fixture.",
        "Dependency regex detects missing qualified references only; real PostgreSQL installation/behavior remains required.",
    ],
}
(HERE / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({"generated": "overlay.sql", "bytes": len(sql.encode()), "sha256": manifest["overlay_sha256"], "counts": manifest["counts"]}))
