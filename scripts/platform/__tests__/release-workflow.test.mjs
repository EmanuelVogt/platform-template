import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(TESTS_DIR, "../../..");
const RELEASE_WORKFLOW_PATH = path.join(ROOT_DIR, ".github/workflows/release.yml");

function readWorkflow() {
  return parseYaml(readFileSync(RELEASE_WORKFLOW_PATH, "utf8"));
}

test("REL-01: verify não tem mais if de job (que pularia o job em vez de falhar)", () => {
  const { jobs } = readWorkflow();
  assert.equal(jobs.verify.if, undefined);
});

test("REL-01: o primeiro passo de verify é um guard incondicional que falha quando o ref não é refs/heads/main", () => {
  const { jobs } = readWorkflow();
  const [firstStep] = jobs.verify.steps;
  assert.equal(firstStep.uses, undefined, "o primeiro passo deve ser run:, não uses:");
  assert.equal(firstStep.if, undefined, "o passo de guarda não pode ter if próprio, senão também pularia");
  assert.match(firstStep.run, /github\.ref/);
  assert.match(firstStep.run, /refs\/heads\/main/);
  assert.match(firstStep.run, /exit 1/);
});

test("REL-02: o job tag depende de verify e catalog", () => {
  const { jobs } = readWorkflow();
  assert.deepEqual(jobs.tag.needs, ["verify", "catalog"]);
});

test("REL-02: verify roda o release-preflight antes de qualquer passo de gate", () => {
  const { jobs } = readWorkflow();
  const runs = jobs.verify.steps.map((step) => step.run).filter(Boolean);
  const preflightIndex = runs.findIndex((run) =>
    /release-preflight\.mjs "\$\{\{ inputs\.version \}\}"/.test(run),
  );
  assert.ok(preflightIndex >= 0, "release-preflight.mjs não encontrado nos passos de verify");
  const gatePatterns = [
    /^pnpm check$/,
    /^pnpm test$/,
    /^pnpm test:scripts$/,
    /^pnpm catalog:lint$/,
    /^pnpm catalog:typecheck$/,
  ];
  for (const pattern of gatePatterns) {
    const gateIndex = runs.findIndex((run) => pattern.test(run.trim()));
    assert.ok(gateIndex >= 0, `passo de gate ${pattern} não encontrado`);
    assert.ok(preflightIndex < gateIndex, `preflight deve rodar antes de ${pattern}`);
  }
});

test("REL-02: tag é o único job com permissions.contents write", () => {
  const { jobs } = readWorkflow();
  const jobsWithWrite = Object.entries(jobs)
    .filter(([, job]) => job.permissions?.contents === "write")
    .map(([name]) => name);
  assert.deepEqual(jobsWithWrite, ["tag"]);
});
