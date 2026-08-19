# test-suite-refactor — Context (gray areas)

Decisions taken at Specify (2026-08-19) from the test-quality audit (31 e2e / 153 spec / 36 int-spec / 34 web tests; e2e 4,880 LOC, api src specs 24,951 LOC). Each row is the agent's default — the owner corrects on the spec; unconfirmed rows are listed as assumptions in `spec.md`.

## GA-1 Sequencing vs `v1-kernel-only-module-catalog`

**Options:** (a) run now on `main` against `apps/api/src/modules/**` + `apps/api/test/**`; (b) inject the harness into v1 wave 3 (entries T17–T21 consume it as they are written); (c) run **after v1 wave 4 (T22 cutover)**, when test code sits in its final home (kernel in the template, modules in `catalog/<entry>/api/**`).

**Default: (c).** (a) refactors files T22 deletes/moves — double work plus merge pain on the worktree. (b) changes an in-flight wave's contract mid-execution; workers already dispatched. (c) touches each file once in its final location; entries written in wave 3 with today's patterns are migrated here (they are in-repo, no child is affected before v1.0.0). Cost: entry tests are touched twice (wave 3 write, this feature migrate). Accepted.

Also feeds `pre-push-coverage-95`: its remaining fills T4–T8 target module trees that leave the template denominator at T22; only T3 (`shared/`), T9 (rest of api src), T10 remnant (web) and T11 (ratchet) survive. They are absorbed here (§ COV requirements), the old feature is closed as "absorbed".

## GA-2 Where the importable harness lives (api)

**Options:** keep `apps/api/test/setup/*` as the single home; move importable helpers to `apps/api/src/shared/test/**`; split.

**Default: split by role.**
- `apps/api/test/` keeps only **runner plumbing** nothing imports from a spec: `jest-*.json`, `setup/{global-setup,global-teardown,e2e-env,int-env,unit-env,e2e-after-env,container-uris,docker-runtime,scalar-stub}.ts`, `tools/`.
- `apps/api/src/shared/test/` (already the v1 home of `parity/contract-snapshot.ts`, allow-listed by RULE C as "fixtures") holds everything a spec imports, kernel vocabulary only: `unit/` (fakes, `mockOf`, clock, request-context), `int/` (`withTestDb`, pools, truncate by schema), `e2e/` (`createE2eApp`, `resetDb`, `drainOutbox`, `expectProblem`, `cookieValue`, `waitFor`, `fixtures`).
- Entry-owned helpers (`seedUser`, `loginAs`, `fakeMailer`, `inMemoryStorage`, `PNG_1PX`, `tokenFromMail`) live in the entry: `catalog/<entry>/api/testing/**` → child path `apps/api/src/modules/<entry>/testing/**`. A dependent entry (attachment e2e needing a logged-in user) imports the dependency's `testing/` barrel — same `dependsOn` graph as production code.

Rationale: RULE C forbids module vocabulary in `shared/**`; today `test/setup` has `seedUser`/`truncateIdentity`/`fake-mailer` — kernel harness cannot keep them once identity is an entry. Relative import depth from `src/modules/<m>/…` to `src/shared/test/e2e` is the same class as production imports of `shared/kernel`.

## GA-3 Unit doubles: typed `jest.fn()` factories vs hand-written in-memory fakes

**Default: typed mock factories + a small set of stateful fakes where state matters.** `mockOf<T>(partial): jest.Mocked<T>` for ports; stateful `InMemory*` only for repositories where use-case specs assert on persisted state (today's best pattern: `archive-notification.use-case.spec.ts:28` captures the saved entity). Rationale: 740 `jest.fn(` sites already exist; a full in-memory repo layer would be a parallel implementation to maintain per entry. Stateful fakes are entry-owned (`testing/`), `mockOf` is kernel.

## GA-4 Fixture style: builders vs literals

**Default: one `make<Entity>(overrides)` per aggregate, kernel-free, owned by the entry's `testing/`.** Replaces 19 local `makeUser` definitions. Literal dates/emails become named constants in the same barrel (`TEST_PASSWORD`, `FIXED_NOW`, `emails.ana`).

## GA-5 Test lint

**Default: add `eslint-plugin-jest` (api, `*.spec.ts|*.int-spec.ts|*.e2e-spec.ts`), `@vitest/eslint-plugin` + `eslint-plugin-testing-library` + `eslint-plugin-jest-dom` (web) to `packages/eslint-config`**, recommended presets + `no-focused-tests`/`no-disabled-tests`/`expect-expect`/`no-conditional-expect`/`prefer-screen-queries` as errors. Plus one local rule in `packages/eslint-config/rules/` (precedent: `sr-only-requires-positioned-ancestor`): **`no-existence-only-assert`** — a test body whose only `expect` calls are `toBeDefined/toBeTruthy/toBeUndefined/toBeFalsy/not.toThrow()` fails lint (L-007 made mechanical). Rationale: the handbook rule exists since L-007 and still has 24 `toBeDefined` + 22 bare `not.toThrow()` in api src.

## GA-6 CI

**Default: `.github/workflows/ci.yml` in the template (platform-owned per `docs/dev/template.md`)** with jobs: `check` (lint+typecheck), `unit` (api `test:cov` + web `test:cov`, 95% gates from COV), `int`, `e2e` (both with Docker services), `contract` (`pnpm contract && git diff --exit-code openapi.json`), `coverage-all` (nyc merge, existing floors 85/51/90/90). If v1 T24 lands a `catalog-check` workflow first, this feature extends that file instead of adding a second. Pre-push stays Docker-free (decision inherited from coverage-95).

## GA-7 Proof that the refactor did not weaken tests

**Default: three mechanical invariants checked by the Verifier**: (1) `it` count per migrated file ≥ before (files may be split; sum per original file ≥ before); (2) the sensor's mutant list (drawn from audit weak spots, `spec.md` § Sensor set) is killed after the refactor; (3) no `.skip`/`.only`/`it.todo` introduced (lint). No behavioural test is deleted; tests found to assert nothing are **strengthened**, never removed.
