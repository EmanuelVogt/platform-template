import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  discoverEntries,
  extractContractHeadings,
  lintAdvisoryFrontmatter,
  lintChangelogVersion,
  lintManifest,
  lintReadmeHeadings,
  lintWebImports,
} from "../lib/lint.mjs";

const ROOT = path.dirname(path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url)))));
const CONTRACT_PATH = path.join(ROOT, "docs/catalog/README-contract.md");
const FIXTURES_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/catalog");

const EXPECTED_CONTRACT_HEADINGS = [
  "## Contrato",
  "## Portas do kernel consumidas",
  "## Dados",
  "## Decisões",
  "## Paridade",
  "## Dependências",
  "## Parte web",
  "## Follow-ups absorvidos",
];

function readmeWith(headings) {
  return headings.map((heading) => `${heading}\n\nconteúdo.\n`).join("\n");
}

function advisoryMd(overrides = {}) {
  const fields = {
    id: "ADV-20260901-01",
    kind: "security",
    module: "identity/single-tenant",
    affects: ">=1.0.0 <1.2.0",
    severity: "high",
    detect: "pnpm platform advisory detect ADV-20260901-01",
    fix: "resumo + link para CHANGELOG",
    parity: "apps/api/src/modules/identity/__parity__/sessions.parity.spec.ts",
    ...overrides,
  };
  const frontmatter = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: "${value}"`)
    .join("\n");
  return `---\n${frontmatter}\n---\nContexto, impacto e passos em pt-BR.\n`;
}

test("extractContractHeadings lê os 8 H2 do contrato real, na ordem definida em docs/catalog/README-contract.md", () => {
  const headings = extractContractHeadings(readFileSync(CONTRACT_PATH, "utf8"));
  assert.deepEqual(headings, EXPECTED_CONTRACT_HEADINGS);
});

test("lintReadmeHeadings passa quando as 8 seções aparecem na ordem exata", () => {
  const errors = lintReadmeHeadings(readmeWith(EXPECTED_CONTRACT_HEADINGS), EXPECTED_CONTRACT_HEADINGS);
  assert.deepEqual(errors, []);
});

test("lintReadmeHeadings falha quando uma seção obrigatória está ausente (## Paridade)", () => {
  const withoutParidade = EXPECTED_CONTRACT_HEADINGS.filter((heading) => heading !== "## Paridade");
  const errors = lintReadmeHeadings(readmeWith(withoutParidade), EXPECTED_CONTRACT_HEADINGS);
  assert.ok(errors.length > 0);
  assert.match(errors[0], /## Paridade/);
});

test("lintReadmeHeadings falha quando duas seções estão fora de ordem", () => {
  const swapped = [...EXPECTED_CONTRACT_HEADINGS];
  [swapped[2], swapped[3]] = [swapped[3], swapped[2]];
  const errors = lintReadmeHeadings(readmeWith(swapped), EXPECTED_CONTRACT_HEADINGS);
  assert.ok(errors.some((error) => error.includes('"## Dados"') && error.includes('posição 3')));
});

test("lintChangelogVersion passa quando existe heading keep-a-changelog para a versão", () => {
  const errors = lintChangelogVersion("## [1.0.0] - 2026-01-01\n\n- inicial\n", "1.0.0");
  assert.deepEqual(errors, []);
});

test("lintChangelogVersion falha quando não há heading para a versão do module.json", () => {
  const errors = lintChangelogVersion("## [0.9.0] - 2026-01-01\n\n- inicial\n", "1.0.0");
  assert.equal(errors.length, 1);
  assert.match(errors[0], /1\.0\.0/);
});

test("lintWebImports passa para web/core só com zod, @platform/api-client (com subpath) e imports relativos", () => {
  const files = [
    {
      path: "catalog/identity/single-tenant/web/core/session.ts",
      layer: "core",
      content: `import { z } from "zod";\nimport { useLogin } from "@platform/api-client/hooks/useLogin";\nimport { schema } from "./schema";\n`,
    },
  ];
  assert.deepEqual(lintWebImports(files), []);
});

test("lintWebImports falha quando web/core importa @tanstack/react-router", () => {
  const files = [
    {
      path: "catalog/identity/single-tenant/web/core/router.ts",
      layer: "core",
      content: `import { createRouter } from "@tanstack/react-router";\n`,
    },
  ];
  const errors = lintWebImports(files);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /@tanstack\/react-router/);
});

test("lintWebImports permite @tanstack/react-query em web/react mas não em web/core", () => {
  const reactFiles = [
    {
      path: "catalog/identity/single-tenant/web/react/use-session.ts",
      layer: "react",
      content: `import { useQuery } from "@tanstack/react-query";\n`,
    },
  ];
  assert.deepEqual(lintWebImports(reactFiles), []);

  const coreFiles = [
    {
      path: "catalog/identity/single-tenant/web/core/use-session.ts",
      layer: "core",
      content: `import { useQuery } from "@tanstack/react-query";\n`,
    },
  ];
  const errors = lintWebImports(coreFiles);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /@tanstack\/react-query/);
});

test("lintManifest passa para um module.json válido", () => {
  const manifest = {
    name: "alpha",
    version: "1.0.0",
    kernelRange: ">=1.0.0 <2.0.0",
    apiModule: { export: "AlphaModule", path: "modules/alpha/alpha.module" },
  };
  assert.deepEqual(lintManifest(manifest), []);
});

test("lintManifest falha e reporta o campo obrigatório ausente", () => {
  const manifest = { name: "alpha", version: "1.0.0" };
  const errors = lintManifest(manifest);
  assert.ok(errors.some((error) => error.includes("campo obrigatório ausente: kernelRange")));
});

test("lintAdvisoryFrontmatter passa para um advisory com frontmatter válido", () => {
  assert.deepEqual(lintAdvisoryFrontmatter(advisoryMd(), "docs/advisories/ADV-20260901-01.md"), []);
});

test("lintAdvisoryFrontmatter falha e nomeia o campo obrigatório ausente", () => {
  const md = advisoryMd({ parity: undefined });
  const errors = lintAdvisoryFrontmatter(md, "docs/advisories/ADV-20260901-01.md");
  assert.equal(errors.length, 1);
  assert.match(errors[0], /parity/);
});

test("discoverEntries encontra as entradas fixture, incluindo a forma <name>/<variant>", () => {
  // fixtures/catalog é compartilhado entre workers da wave; outras entradas podem coexistir.
  const entries = discoverEntries(FIXTURES_ROOT).map((entryDir) => path.relative(FIXTURES_ROOT, entryDir));
  assert.ok(entries.includes("alpha"));
  assert.ok(entries.includes("beta"));
  assert.ok(entries.includes(path.join("gamma", "variant-x")));
});
