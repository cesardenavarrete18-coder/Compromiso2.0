# M1-04B isolated synthetic fixtures

`contact-runtime.integration.test.mjs` uses the captured schema-only baseline B
and the existing captured Assignment overlays. It creates only synthetic users
at `example.invalid`, synthetic leads and deterministic protocol windows.

No production rows, messages, credentials, network clients or cron are included.
The five candidate migrations are installed verbatim by a PostgreSQL 17 session;
test-only gateway/getter grants and technical adoptions are explicit in the suite.
Injection triggers, when used to verify atomic rollback, are created only inside
the disposable database and removed after their test.

The fixed acceptance identifiers DB-B01 through DB-B80 map to §12 of the approved
M1-04B plan. DB-B79/80 assert regression boundaries in the B installation; the
146 earlier DB cases remain independently executed under their original IDs and
are not counted again as new B tests.
