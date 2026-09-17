"""Generate a data-free fixture from checked-in, SELECT-only catalogue evidence.

This generator writes files only. It never connects to a database or a network.
Use the generated bootstrap only in the isolated test runner's fresh cluster.
"""
import hashlib
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
SOURCE = HERE / 'source.json'
data = json.loads(SOURCE.read_text())
app = data['application']['snapshot']
security = data['security']['snapshot']
platform = data['platform']['snapshot']


def ident(value):
    return '"' + value.replace('"', '""') + '"'


def literal(value):
    return "'" + value.replace("'", "''") + "'"


def qualified(schema, name):
    return ident(schema) + '.' + ident(name)


def acl_entries(value):
    if value is None:
        return None
    assert value.startswith('{') and value.endswith('}'), value
    entries = []
    for entry in value[1:-1].split(',') if value != '{}' else []:
        match = re.fullmatch(r'([a-zA-Z_0-9]*)=([A-Za-z*]*)/([a-zA-Z_0-9]+)', entry)
        assert match, 'Unrepresented ACL syntax: ' + entry
        grantee, codes, grantor = match.groups()
        privileges = []
        for code, star in re.findall(r'([A-Za-z])(\*?)', codes):
            privileges.append((code, bool(star)))
        entries.append((grantee or 'PUBLIC', grantor, privileges))
    return entries


PRIVILEGES = {
    'TABLE': {'a': 'INSERT', 'r': 'SELECT', 'w': 'UPDATE', 'd': 'DELETE', 'D': 'TRUNCATE', 'x': 'REFERENCES', 't': 'TRIGGER', 'm': 'MAINTAIN'},
    'SEQUENCE': {'r': 'SELECT', 'w': 'UPDATE', 'U': 'USAGE'},
    'FUNCTION': {'X': 'EXECUTE'},
    'SCHEMA': {'U': 'USAGE', 'C': 'CREATE'},
    'TYPE': {'U': 'USAGE'},
}
roles = [r['name'] for r in security['roles'] if r['name'] != 'pg_database_owner']
grantees = ['PUBLIC', *roles]


def restore_acl(kind, target, value, owner):
    entries = acl_entries(value)
    if entries is None:
        # NULL is PostgreSQL's built-in ACL, not an empty ACL. Objects were
        # created before reproducing the observed custom default privileges.
        return []
    lines = [f'REVOKE ALL ON {kind} {target} FROM ' + ', '.join(g if g == 'PUBLIC' else ident(g) for g in grantees) + ';']
    for grantee, grantor, privileges in entries:
        # pg_database_owner is an implicit role of the current database owner.
        actual_grantor = 'postgres' if grantor == 'pg_database_owner' else grantor
        lines.append(f'SET LOCAL ROLE {ident(actual_grantor)};')
        for code, grantable in privileges:
            name = PRIVILEGES[kind][code]
            target_role = grantee if grantee == 'PUBLIC' else ident(grantee)
            lines.append(f'GRANT {name} ON {kind} {target} TO {target_role}' + (' WITH GRANT OPTION' if grantable else '') + ';')
        lines.append('RESET ROLE;')
    return lines


lines = [
    '-- GENERATED from source.json; run build.py to reproduce. No personal rows.',
    '-- Relevant observed schema, NOT an entire production database clone.',
    '-- Fresh isolated PostgreSQL 17 cluster only; no cron/net/vault installation.',
    'BEGIN;',
    "SET LOCAL search_path = public, extensions;",
    'SET LOCAL check_function_bodies = off;',
    "DO $$ BEGIN IF current_setting('server_version_num')::integer < 170000 THEN RAISE EXCEPTION 'SCHEMA_B_REQUIRES_POSTGRES_17'; END IF; END $$;",
    "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE oid=10 AND rolname='supabase_admin' AND rolsuper) THEN RAISE EXCEPTION 'SCHEMA_B_REQUIRES_SUPABASE_ADMIN_BOOTSTRAP'; END IF; END $$;",
]

for role in security['roles']:
    if role['name'] in ('pg_database_owner', 'supabase_admin'):
        continue
    options = []
    for field, positive, negative in [
        ('can_login', 'LOGIN', 'NOLOGIN'), ('superuser', 'SUPERUSER', 'NOSUPERUSER'),
        ('inherit', 'INHERIT', 'NOINHERIT'), ('create_role', 'CREATEROLE', 'NOCREATEROLE'),
        ('create_db', 'CREATEDB', 'NOCREATEDB'), ('replication', 'REPLICATION', 'NOREPLICATION'),
        ('bypass_rls', 'BYPASSRLS', 'NOBYPASSRLS'),
    ]:
        options.append(positive if role[field] else negative)
    lines.append(f'CREATE ROLE {ident(role["name"])} ' + ' '.join(options) + ';')

lines += [
    "DO $$ BEGIN EXECUTE format('ALTER DATABASE %I OWNER TO postgres',current_database()); END $$;",
    'SET LOCAL ROLE supabase_admin;',
]
for member in security['memberships']:
    assert member['grantor'] == 'supabase_admin'
    options = ', '.join(f'{key} {str(member[field]).lower()}' for key, field in [('ADMIN', 'admin'), ('INHERIT', 'inherit'), ('SET', 'set')])
    lines.append(f'GRANT {ident(member["role"])} TO {ident(member["member"])} WITH {options};')
lines.append('RESET ROLE;')

for schema in platform['schemas']:
    if schema['name'] == 'public':
        lines.append(f'ALTER SCHEMA public OWNER TO {ident(schema["owner"])};')
    else:
        lines.append(f'CREATE SCHEMA {ident(schema["name"])} AUTHORIZATION {ident(schema["owner"])};')

enum_rows = app['enums']
assert len({(e['schema'], e['name'], e['owner']) for e in enum_rows}) == 1
enum = enum_rows[0]
lines.append(f'CREATE TYPE {qualified(enum["schema"], enum["name"])} AS ENUM (' + ', '.join(literal(e['label']) for e in sorted(enum_rows, key=lambda e: e['sort'])) + ');')
lines.append(f'ALTER TYPE {qualified(enum["schema"], enum["name"])} OWNER TO {ident(enum["owner"])};')

for table in app['tables']:
    assert table['kind'] == 'r' and table['persistence'] == 'p' and table['options'] is None
    columns = []
    for column in [c for c in app['columns'] if (c['schema'], c['table']) == (table['schema'], table['name'])]:
        declaration = ident(column['name']) + ' ' + column['type']
        assert column['collation'] in (None, '"default"'), column
        if column['identity']:
            sequence = next(s for s in app['sequences'] if (s['table_schema'], s['table'], s['column']) == (column['schema'], column['table'], column['name']))
            mode = {'a': 'ALWAYS', 'd': 'BY DEFAULT'}[column['identity']]
            declaration += f' GENERATED {mode} AS IDENTITY (SEQUENCE NAME {qualified(sequence["schema"],sequence["name"])} START WITH {sequence["start"]} INCREMENT BY {sequence["increment"]} MINVALUE {sequence["minimum"]} MAXVALUE {sequence["maximum"]} CACHE {sequence["cache"]}'
            declaration += ' CYCLE)' if sequence['cycle'] else ' NO CYCLE)'
        elif column['generated']:
            assert column['generated'] == 's'
            declaration += f' GENERATED ALWAYS AS ({column["default"]}) STORED'
        if column['not_null']:
            declaration += ' NOT NULL'
        columns.append('  ' + declaration)
    target = qualified(table['schema'], table['name'])
    lines.append(f'CREATE TABLE {target} (\n' + ',\n'.join(columns) + '\n);')
    lines.append(f'ALTER TABLE {target} OWNER TO {ident(table["owner"])};')

for function in app['functions']:
    assert function['language'] in ('sql', 'plpgsql')
    assert not re.search(r'net\.http|http_post|dblink|vault\.|cron\.', function['definition'], re.I)
    lines.append(function['definition'].rstrip() + ';')
    target = qualified(function['schema'], function['name']) + '(' + function['arguments'] + ')'
    lines.append(f'ALTER FUNCTION {target} OWNER TO {ident(function["owner"])};')

for column in app['columns']:
    if column['default'] is not None and not column['generated'] and not column['identity']:
        lines.append(f'ALTER TABLE {qualified(column["schema"],column["table"])} ALTER COLUMN {ident(column["name"])} SET DEFAULT {column["default"]};')

# Create referenced unique/primary keys before foreign keys, including cycles.
for constraint in sorted(app['constraints'], key=lambda c: (c['type'] == 'f', c['schema'], c['table'], c['name'])):
    statement = f'ALTER TABLE {qualified(constraint["schema"],constraint["table"])} ADD CONSTRAINT {ident(constraint["name"])} {constraint["definition"]}'
    # pg_get_constraintdef includes DEFERRABLE / NOT VALID when present.
    lines.append(statement + ';')
for index in app['indexes']:
    assert index['valid'] and index['ready']
    if index['constraint_name'] is None:
        lines.append(index['definition'] + ';')

for trigger in app['triggers']:
    lines.append(trigger['definition'] + ';')
    if trigger['enabled'] != 'O':
        action = {'D': 'DISABLE', 'R': 'ENABLE REPLICA', 'A': 'ENABLE ALWAYS'}[trigger['enabled']]
        lines.append(f'ALTER TABLE {qualified(trigger["schema"],trigger["table"])} {action} TRIGGER {ident(trigger["name"])};')

for policy in app['policies']:
    target = qualified(policy['schemaname'], policy['tablename'])
    statement = f'CREATE POLICY {ident(policy["policyname"])} ON {target} AS {policy["permissive"]} FOR {policy["cmd"]} TO '
    statement += ', '.join('PUBLIC' if r == 'public' else ident(r) for r in policy['roles'])
    if policy['qual'] is not None:
        statement += ' USING (' + policy['qual'] + ')'
    if policy['with_check'] is not None:
        statement += ' WITH CHECK (' + policy['with_check'] + ')'
    lines.append(statement + ';')
for table in app['tables']:
    target = qualified(table['schema'], table['name'])
    if table['rls_enabled']:
        lines.append(f'ALTER TABLE {target} ENABLE ROW LEVEL SECURITY;')
    if table['rls_forced']:
        lines.append(f'ALTER TABLE {target} FORCE ROW LEVEL SECURITY;')

# Reproduce object ACLs after schema/function creation, not broad fixture grants.
for schema in platform['schemas']:
    lines += restore_acl('SCHEMA', ident(schema['name']), schema['acl'], schema['owner'])
lines += restore_acl('TYPE', qualified(enum['schema'], enum['name']), enum['acl'], enum['owner'])
for table in app['tables']:
    lines += restore_acl('TABLE', qualified(table['schema'],table['name']), table['acl'], table['owner'])
for sequence in app['sequences']:
    lines += restore_acl('SEQUENCE', qualified(sequence['schema'],sequence['name']), sequence['acl'], sequence['owner'])
for function in app['functions']:
    target = qualified(function['schema'],function['name']) + '(' + function['arguments'] + ')'
    lines += restore_acl('FUNCTION', target, function['acl'], function['owner'])
assert not any(c['acl'] is not None for c in app['columns']), 'Column ACL restoration not implemented: stop rather than flatten.'

for default in security['default_privileges']:
    kind, object_kind = {'r': ('TABLES','TABLE'), 'S': ('SEQUENCES','SEQUENCE'), 'f': ('FUNCTIONS','FUNCTION')}[default['type']]
    prefix = f'ALTER DEFAULT PRIVILEGES FOR ROLE {ident(default["owner"])}'
    if default['schema'] is not None:
        prefix += ' IN SCHEMA ' + ident(default['schema'])
    # Schema defaults are additive. Do not revoke global built-in defaults:
    # preserve the captured scope rather than invent global ACL changes.
    prefix += ' GRANT '
    for grantee, grantor, privileges in acl_entries(default['acl']):
        for code, grantable in privileges:
            target_role = grantee if grantee == 'PUBLIC' else ident(grantee)
            lines.append(prefix + PRIVILEGES[object_kind][code] + f' ON {kind} TO {target_role}' + (' WITH GRANT OPTION' if grantable else '') + ';')

lines += [
    'SET LOCAL check_function_bodies = on;',
    '-- No application/auth user rows, sequence last_value, jobs or secrets restored.',
    'COMMIT;',
]
text = '\n\n'.join(lines) + '\n'
(HERE / 'bootstrap.sql').write_text(text)
manifest = {
    'schema': 'crm.m1.schema-baseline-b/1',
    'scope': 'Relevant observed schema and direct/transitive application dependencies; not a full production clone.',
    'source_sha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
    'bootstrap_sha256': hashlib.sha256(text.encode()).hexdigest(),
    'captures': {k: data[k]['snapshot']['captured_at'] for k in ['platform','application','security']},
    'counts': {k: len(app[k]) for k in ['tables','columns','constraints','indexes','triggers','policies','functions','sequences']},
    'data_rows': 0,
    'bootstrap_role': {'name': 'supabase_admin', 'oid': 10, 'production_postgres_is_bootstrap': False},
    'bootstrap_execution': 'NOT_EXECUTED_BY_GENERATOR',
    'excluded_platform_extensions': [e['name'] for e in platform['extensions'] if e['name'] != 'plpgsql'],
    'limitations': [
        'Snapshots span separate SELECT statements; not a transactionally consistent production dump.',
        'No database data, passwords, sequence last values, jobs, settings secrets or remote egress restored.',
        'Only listed schema objects are reproduced; other platform auth tables, realtime, storage and unrelated CRM objects remain out of scope.',
        'Database name and locale are controlled by the isolated harness; database owner postgres is reproduced.',
        'Database-level CREATE grants to platform-only supabase_etl_admin/supabase_storage_admin are inventoried but not reproduced; those roles have no ownership/grants in the selected object boundary.',
        'External extensions are inventoried but not installed because the selected dependency boundary has no calls to them.',
        'No M1 execution or business behavior is certified by generating this file.',
    ],
}
(HERE / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps({'generated': 'bootstrap.sql', 'bytes': len(text.encode()), 'sha256': manifest['bootstrap_sha256'], 'counts': manifest['counts']}))
