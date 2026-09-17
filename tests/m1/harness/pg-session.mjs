import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const transport = fileURLToPath(new URL('./libpq-session.py', import.meta.url));

export function sqlLiteral(value) {
  if (value === null) return 'NULL';
  return "'" + String(value).replaceAll("'", "''") + "'";
}

export function sqlJson(value) {
  return `${sqlLiteral(JSON.stringify(value))}::jsonb`;
}

export class PgSession {
  constructor(name = 'm1-test') {
    if (process.env.M1_TEST_ISOLATED !== 'unix-socket-seccomp-v1') {
      throw new Error('BLOCKED: integration tests require harness/run-local.py');
    }
    this.pending = new Map();
    this.sequence = 0;
    this.stderr = '';
    this.child = spawn(process.env.M1_PYTHON_BIN, [transport], {
      env: { ...process.env, M1_TEST_APPLICATION: name },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child.stderr.on('data', chunk => { this.stderr += chunk.toString(); });
    const lines = createInterface({ input: this.child.stdout });
    lines.on('line', line => {
      const message = JSON.parse(line);
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      pending.resolve(message);
    });
    this.child.on('exit', (code, signal) => {
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error(`SQL session exited (${code ?? signal}): ${this.stderr}`));
      }
      this.pending.clear();
    });
  }

  query(sql, { allowError = false, timeout = 18000 } = {}) {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.child.kill('SIGKILL');
        reject(new Error(`SQL harness timeout for request ${id}`));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ id, sql }) + '\n');
    }).then(result => {
      if (!allowError && !result.ok) throw new Error(`${result.sqlstate}: ${result.error}`);
      return result;
    });
  }

  async scalar(sql) {
    const result = await this.query(sql);
    return result.rows[0]?.[0] ?? null;
  }

  async json(sql) {
    const value = await this.scalar(sql);
    return value === null ? null : JSON.parse(value);
  }

  async close() {
    if (this.child.exitCode !== null || this.child.signalCode !== null) return;
    this.child.stdin.end();
    await new Promise(resolve => this.child.once('exit', resolve));
  }
}
