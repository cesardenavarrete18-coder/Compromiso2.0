#!/usr/bin/env python3
"""JSON-lines SQL transport over libpq, restricted to this harness's Unix socket.

This is a real PostgreSQL connection; no SQL behavior is mocked. The parent
launcher supplies an allowlisted environment and inherited seccomp filter.
"""
import ctypes
import json
import os
import pathlib
import socket
import sys


def fail(message):
    raise SystemExit(message)


if os.environ.get("M1_TEST_ISOLATED") != "unix-socket-seccomp-v1":
    fail("BLOCKED: run through harness/run-local.py")
sockdir = pathlib.Path(os.environ["M1_TEST_SOCKET_DIR"])
if not sockdir.is_absolute() or not sockdir.is_dir():
    fail("BLOCKED: an existing absolute Unix socket directory is required")
allowed_database = "postgres" if sys.argv[1:] == ["--bootstrap"] else "m1_foundation_test"
if os.environ.get("M1_TEST_DATABASE") != allowed_database:
    fail("BLOCKED: unexpected database name")
for family in (socket.AF_INET, socket.AF_INET6):
    try:
        probe = socket.socket(family, socket.SOCK_STREAM)
    except PermissionError:
        pass
    else:
        probe.close()
        fail("BLOCKED: IP sockets are not denied")

pq = ctypes.CDLL(os.environ["M1_LIBPQ_PATH"])
pq.PQconnectdbParams.argtypes = [ctypes.POINTER(ctypes.c_char_p), ctypes.POINTER(ctypes.c_char_p), ctypes.c_int]
pq.PQconnectdbParams.restype = ctypes.c_void_p
pq.PQstatus.argtypes = [ctypes.c_void_p]
pq.PQstatus.restype = ctypes.c_int
pq.PQerrorMessage.argtypes = [ctypes.c_void_p]
pq.PQerrorMessage.restype = ctypes.c_char_p
pq.PQexec.argtypes = [ctypes.c_void_p, ctypes.c_char_p]
pq.PQexec.restype = ctypes.c_void_p
pq.PQresultStatus.argtypes = [ctypes.c_void_p]
pq.PQresultStatus.restype = ctypes.c_int
pq.PQresultErrorMessage.argtypes = [ctypes.c_void_p]
pq.PQresultErrorMessage.restype = ctypes.c_char_p
pq.PQresultErrorField.argtypes = [ctypes.c_void_p, ctypes.c_int]
pq.PQresultErrorField.restype = ctypes.c_char_p
pq.PQntuples.argtypes = [ctypes.c_void_p]
pq.PQntuples.restype = ctypes.c_int
pq.PQnfields.argtypes = [ctypes.c_void_p]
pq.PQnfields.restype = ctypes.c_int
pq.PQfname.argtypes = [ctypes.c_void_p, ctypes.c_int]
pq.PQfname.restype = ctypes.c_char_p
pq.PQgetvalue.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int]
pq.PQgetvalue.restype = ctypes.c_char_p
pq.PQgetisnull.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int]
pq.PQgetisnull.restype = ctypes.c_int
pq.PQcmdTuples.argtypes = [ctypes.c_void_p]
pq.PQcmdTuples.restype = ctypes.c_char_p
pq.PQclear.argtypes = [ctypes.c_void_p]
pq.PQfinish.argtypes = [ctypes.c_void_p]

params = {
    "host": str(sockdir),
    "port": os.environ["M1_TEST_PORT"],
    "dbname": os.environ["M1_TEST_DATABASE"],
    "user": "m1_test_admin",
    "connect_timeout": "3",
    "application_name": os.environ.get("M1_TEST_APPLICATION", "m1-foundation-harness"),
    "options": "-c statement_timeout=15000 -c idle_in_transaction_session_timeout=20000",
}
keys = (ctypes.c_char_p * (len(params) + 1))(*[key.encode() for key in params], None)
values = (ctypes.c_char_p * (len(params) + 1))(*[value.encode() for value in params.values()], None)
connection = pq.PQconnectdbParams(keys, values, 0)
if not connection or pq.PQstatus(connection) != 0:
    fail("PostgreSQL connection failed: " + (pq.PQerrorMessage(connection) or b"").decode())


def execute(sql):
    result = pq.PQexec(connection, sql.encode())
    if not result:
        return {"ok": False, "sqlstate": None, "error": pq.PQerrorMessage(connection).decode()}
    try:
        status = pq.PQresultStatus(result)
        if status not in (1, 2):
            code = pq.PQresultErrorField(result, ord("C"))
            return {"ok": False, "sqlstate": code.decode() if code else None,
                    "error": pq.PQresultErrorMessage(result).decode()}
        columns = [pq.PQfname(result, column).decode() for column in range(pq.PQnfields(result))]
        rows = [[None if pq.PQgetisnull(result, row, column) else pq.PQgetvalue(result, row, column).decode()
                 for column in range(len(columns))] for row in range(pq.PQntuples(result))]
        return {"ok": True, "columns": columns, "rows": rows,
                "affected": (pq.PQcmdTuples(result) or b"").decode()}
    finally:
        pq.PQclear(result)


try:
    # Confirm this is the fresh harness cluster, including its random marker.
    marker = execute("SELECT current_setting('m1.test_run_id', true), current_setting('listen_addresses'), current_setting('server_version_num')")
    if not marker["ok"] or marker["rows"][0][0] != os.environ["M1_TEST_RUN_ID"] or marker["rows"][0][1] != "":
        fail("BLOCKED: cluster identity or Unix-only transport not verified")
    for line in sys.stdin:
        try:
            request = json.loads(line)
            response = execute(request["sql"])
            response["id"] = request.get("id")
        except Exception as error:
            response = {"ok": False, "id": None, "error": str(error), "sqlstate": None}
        print(json.dumps(response), flush=True)
finally:
    pq.PQfinish(connection)
