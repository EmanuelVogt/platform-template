import test from "node:test";
import assert from "node:assert/strict";
import { EXIT_CODES } from "../lib/exit-codes.mjs";
import {
  helpText,
  parseArgs,
  parseSchemaList,
  planSteps,
  runTemplateSmoke,
  schemasMatchExpected,
  waitForHealth,
  waitForPostgresReady,
} from "../../template-smoke.mjs";

function noopLog() {}

function stubRun(overrides) {
  const calls = [];
  const fn = (command, args = [], options = {}) => {
    calls.push({ command, args, options });
    const key = [command, ...args].join(" ");
    const match = Object.entries(overrides ?? {}).find(([pattern]) => key.includes(pattern));
    return match ? match[1] : { status: 0, stdout: "", stderr: "" };
  };
  fn.calls = calls;
  return fn;
}

function immediateSleep() {
  return Promise.resolve();
}

test("parseArgs recognizes --help, --dry-run/--plan and --keep independently", () => {
  assert.deepEqual(parseArgs([]), { help: false, dryRun: false, keep: false });
  assert.deepEqual(parseArgs(["--help"]), { help: true, dryRun: false, keep: false });
  assert.deepEqual(parseArgs(["-h"]), { help: true, dryRun: false, keep: false });
  assert.deepEqual(parseArgs(["--dry-run"]), { help: false, dryRun: true, keep: false });
  assert.deepEqual(parseArgs(["--plan", "--keep"]), { help: false, dryRun: true, keep: true });
});

test("planSteps names the four design checks in order", () => {
  const steps = planSteps();
  assert.equal(steps.length, 4);
  assert.match(steps[0], /pnpm check.*pnpm test/);
  assert.match(steps[1], /_kernel.*drizzle/);
  assert.match(steps[2], /GET \/health/);
  assert.match(steps[3], /module-boundaries\.spec\.ts/);
});

test("helpText documents usage and embeds the four plan steps", () => {
  const text = helpText();
  assert.match(text, /pnpm template:smoke/);
  for (const step of planSteps()) {
    assert.ok(text.includes(step), `helpText deveria conter o passo: ${step}`);
  }
});

test("parseSchemaList trims and drops blank lines from psql -tAc output", () => {
  assert.deepEqual(parseSchemaList("_kernel\ndrizzle\n"), ["_kernel", "drizzle"]);
  assert.deepEqual(parseSchemaList(" _kernel \n\n drizzle \n"), ["_kernel", "drizzle"]);
  assert.deepEqual(parseSchemaList(""), []);
  assert.deepEqual(parseSchemaList("\n\n"), []);
});

test("schemasMatchExpected accepts _kernel + drizzle regardless of order, and tolerates Postgres's own public schema", () => {
  assert.equal(schemasMatchExpected(["_kernel", "drizzle"]), true);
  assert.equal(schemasMatchExpected(["drizzle", "_kernel"]), true);
  assert.equal(schemasMatchExpected(["_kernel", "drizzle", "public"]), true);
  assert.equal(schemasMatchExpected(["public", "drizzle", "_kernel"]), true);
});

test("schemasMatchExpected rejects a missing required schema or a schema outside _kernel/drizzle/public", () => {
  assert.equal(schemasMatchExpected(["_kernel"]), false);
  assert.equal(schemasMatchExpected(["_kernel", "drizzle", "identity"]), false);
  assert.equal(schemasMatchExpected([]), false);
});

test("waitForPostgresReady stops as soon as pg_isready reports 0", async () => {
  let attempt = 0;
  const run = () => {
    attempt += 1;
    return { status: attempt >= 3 ? 0 : 1, stdout: "", stderr: "" };
  };
  const ready = await waitForPostgresReady({ containerId: "cid", run, attempts: 5, sleep: immediateSleep });
  assert.equal(ready, true);
  assert.equal(attempt, 3);
});

test("waitForPostgresReady gives up after the attempt budget", async () => {
  const run = () => ({ status: 1, stdout: "", stderr: "" });
  const ready = await waitForPostgresReady({ containerId: "cid", run, attempts: 3, sleep: immediateSleep });
  assert.equal(ready, false);
});

test("waitForHealth resolves true once fetch reports status 200", async () => {
  let attempt = 0;
  const fetchImpl = async () => {
    attempt += 1;
    if (attempt < 2) throw new Error("ECONNREFUSED");
    return { status: 200 };
  };
  const healthy = await waitForHealth({ url: "http://localhost:3222/health", fetchImpl, attempts: 5, sleep: immediateSleep });
  assert.equal(healthy, true);
  assert.equal(attempt, 2);
});

test("waitForHealth resolves false when the server never answers 200", async () => {
  const fetchImpl = async () => ({ status: 503 });
  const healthy = await waitForHealth({ url: "http://localhost:3222/health", fetchImpl, attempts: 2, sleep: immediateSleep });
  assert.equal(healthy, false);
});

test("runTemplateSmoke returns CATALOG_UNREACHABLE when the copier render fails", async () => {
  const run = stubRun();
  const code = await runTemplateSmoke({
    scratchDir: "/tmp/template-smoke-test-render",
    run,
    renderChildFn: () => ({ status: 3, stdout: "", stderr: "boom" }),
    installChildFn: () => ({ status: 0, stdout: "", stderr: "" }),
    log: noopLog,
  });
  assert.equal(code, EXIT_CODES.CATALOG_UNREACHABLE);
});

test("runTemplateSmoke returns TEST_FAILURE when pnpm test fails on the child", async () => {
  const run = stubRun({ "pnpm test": { status: 1, stdout: "", stderr: "" } });
  const code = await runTemplateSmoke({
    scratchDir: "/tmp/template-smoke-test-pnpm-test",
    run,
    renderChildFn: () => ({ status: 0, stdout: "", stderr: "" }),
    installChildFn: () => ({ status: 0, stdout: "", stderr: "" }),
    log: noopLog,
  });
  assert.equal(code, EXIT_CODES.TEST_FAILURE);
});

test("runTemplateSmoke returns MIGRATION_FAILURE when db:migrate fails on the child", async () => {
  const run = stubRun({
    "docker run": { status: 0, stdout: "cid123\n", stderr: "" },
    "docker exec cid123 pg_isready": { status: 0, stdout: "", stderr: "" },
    "docker port cid123": { status: 0, stdout: "0.0.0.0:32000\n", stderr: "" },
    "pnpm --filter api run db:migrate": { status: 1, stdout: "", stderr: "boom" },
  });
  const code = await runTemplateSmoke({
    scratchDir: "/tmp/template-smoke-test-migrate",
    run,
    renderChildFn: () => ({ status: 0, stdout: "", stderr: "" }),
    installChildFn: () => ({ status: 0, stdout: "", stderr: "" }),
    sleep: immediateSleep,
    log: noopLog,
  });
  assert.equal(code, EXIT_CODES.MIGRATION_FAILURE);
});

test("runTemplateSmoke returns MIGRATION_FAILURE when the migrated schemas include one outside _kernel/drizzle/public", async () => {
  const run = stubRun({
    "docker run": { status: 0, stdout: "cid123\n", stderr: "" },
    "docker exec cid123 pg_isready": { status: 0, stdout: "", stderr: "" },
    "docker port cid123": { status: 0, stdout: "0.0.0.0:32000\n", stderr: "" },
    "pnpm --filter api run db:migrate": { status: 0, stdout: "", stderr: "" },
    "docker exec cid123 psql": { status: 0, stdout: "_kernel\ndrizzle\nidentity\n", stderr: "" },
  });
  const code = await runTemplateSmoke({
    scratchDir: "/tmp/template-smoke-test-schema-mismatch",
    run,
    renderChildFn: () => ({ status: 0, stdout: "", stderr: "" }),
    installChildFn: () => ({ status: 0, stdout: "", stderr: "" }),
    sleep: immediateSleep,
    log: noopLog,
  });
  assert.equal(code, EXIT_CODES.MIGRATION_FAILURE);
});

test("runTemplateSmoke does not fail on schema check when Postgres's own public schema is present", async () => {
  const run = stubRun({
    "docker run": { status: 0, stdout: "cid123\n", stderr: "" },
    "docker exec cid123 pg_isready": { status: 0, stdout: "", stderr: "" },
    "docker port cid123": { status: 0, stdout: "0.0.0.0:32000\n", stderr: "" },
    "pnpm --filter api run db:migrate": { status: 0, stdout: "", stderr: "" },
    "docker exec cid123 psql": { status: 0, stdout: "_kernel\ndrizzle\npublic\n", stderr: "" },
  });
  const code = await runTemplateSmoke({
    scratchDir: "/tmp/template-smoke-test-schema-public-ok",
    run,
    renderChildFn: () => ({ status: 0, stdout: "", stderr: "" }),
    installChildFn: () => ({ status: 0, stdout: "", stderr: "" }),
    spawnProcess: () => ({ kill: () => {} }),
    fetchImpl: async () => ({ status: 503 }),
    sleep: immediateSleep,
    log: noopLog,
  });
  assert.notEqual(code, EXIT_CODES.MIGRATION_FAILURE);
});

test("runTemplateSmoke returns TEST_FAILURE when GET /health never answers 200", async () => {
  const run = stubRun({
    "docker run": { status: 0, stdout: "cid123\n", stderr: "" },
    "docker exec cid123 pg_isready": { status: 0, stdout: "", stderr: "" },
    "docker port cid123": { status: 0, stdout: "0.0.0.0:32000\n", stderr: "" },
    "pnpm --filter api run db:migrate": { status: 0, stdout: "", stderr: "" },
    "docker exec cid123 psql": { status: 0, stdout: "_kernel\ndrizzle\n", stderr: "" },
  });
  const code = await runTemplateSmoke({
    scratchDir: "/tmp/template-smoke-test-health",
    run,
    renderChildFn: () => ({ status: 0, stdout: "", stderr: "" }),
    installChildFn: () => ({ status: 0, stdout: "", stderr: "" }),
    spawnProcess: () => ({ kill: () => {} }),
    fetchImpl: async () => ({ status: 503 }),
    sleep: immediateSleep,
    log: noopLog,
  });
  assert.equal(code, EXIT_CODES.TEST_FAILURE);
});

test("runTemplateSmoke returns TEST_FAILURE when the RULE C spec fails on the child", async () => {
  const run = stubRun({
    "docker run": { status: 0, stdout: "cid123\n", stderr: "" },
    "docker exec cid123 pg_isready": { status: 0, stdout: "", stderr: "" },
    "docker port cid123": { status: 0, stdout: "0.0.0.0:32000\n", stderr: "" },
    "pnpm --filter api run db:migrate": { status: 0, stdout: "", stderr: "" },
    "docker exec cid123 psql": { status: 0, stdout: "_kernel\ndrizzle\n", stderr: "" },
    "pnpm --filter api exec jest src/modules/module-boundaries.spec.ts": { status: 1, stdout: "", stderr: "" },
  });
  const code = await runTemplateSmoke({
    scratchDir: "/tmp/template-smoke-test-rule-c",
    run,
    renderChildFn: () => ({ status: 0, stdout: "", stderr: "" }),
    installChildFn: () => ({ status: 0, stdout: "", stderr: "" }),
    spawnProcess: () => ({ kill: () => {} }),
    fetchImpl: async () => ({ status: 200 }),
    sleep: immediateSleep,
    log: noopLog,
  });
  assert.equal(code, EXIT_CODES.TEST_FAILURE);
});

test("runTemplateSmoke returns OK when all four checks are green", async () => {
  const run = stubRun({
    "docker run": { status: 0, stdout: "cid123\n", stderr: "" },
    "docker exec cid123 pg_isready": { status: 0, stdout: "", stderr: "" },
    "docker port cid123": { status: 0, stdout: "0.0.0.0:32000\n", stderr: "" },
    "pnpm --filter api run db:migrate": { status: 0, stdout: "", stderr: "" },
    "docker exec cid123 psql": { status: 0, stdout: "_kernel\ndrizzle\n", stderr: "" },
    "pnpm --filter api exec jest src/modules/module-boundaries.spec.ts": { status: 0, stdout: "", stderr: "" },
  });
  const code = await runTemplateSmoke({
    scratchDir: "/tmp/template-smoke-test-ok",
    run,
    renderChildFn: () => ({ status: 0, stdout: "", stderr: "" }),
    installChildFn: () => ({ status: 0, stdout: "", stderr: "" }),
    spawnProcess: () => ({ kill: () => {} }),
    fetchImpl: async () => ({ status: 200 }),
    sleep: immediateSleep,
    log: noopLog,
  });
  assert.equal(code, EXIT_CODES.OK);
});
