# Spike — current coverage (2026-08-19)

Evidence for `pre-push-coverage-95`. Not re-read on every planning turn.

## Gates today

| Suite | Command | S | B | F | L | On pre-push? |
| --- | --- | --- | --- | --- | --- | --- |
| api unit | `jest --coverage` (`apps/api/package.json` `coverageThreshold`) | 43 | 35 | 40 | 45 | no (`turbo test`) |
| api combined | `scripts/coverage-all.sh` nyc check-coverage | 85 | 51 | 90 | 90 | no |
| web | `vitest.config.ts` thresholds | 64 | 56 | 61 | 64 | yes (`turbo test:cov`) |

Web last local report (`apps/web/coverage/coverage-summary.json`): S69.65 / B61.15 / F66.66 / L69.78.

Api combined calibrated on merge ~87.13 / 53.48 / 91.91 / 91.98; floor ~1.5–2pt below. Comment in `coverage-all.sh`: high branch unreachable under `@swc/jest` because `?.` / `??` / default param emit implicit branches.

## Include / exclude today

- api unit `collectCoverageFrom`: `**/*.(t|j)s` under `src` — **does not exclude specs**.
- api combined: `**/*.ts` / `src/**/*.ts`, excludes `*.{spec,int-spec,e2e-spec}.ts` and `*.d.ts`.
- web: include `src/**/*.{ts,tsx}`; exclude `*.test.{ts,tsx}`, `*.d.ts`, `main.tsx`, `shared/test/**`.
- `lefthook.yml`: `test-api` = `turbo test --filter=api`; `test-web` = `turbo test:cov --filter=web`.
- No GitHub Actions coverage job. `coverage/` gitignored.

## Size (approx.)

| Area | Production source | Specs |
| --- | --- | --- |
| `apps/api` | ~447 `.ts` | ~211 |
| `apps/web` | ~34 `.ts(x)` | ~19 |
| `packages/api-client` | ~5 hand-written (rest generated) | 0 |
