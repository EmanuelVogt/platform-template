# Handoff archive — `web-stack-next`

Moved out of `.specs/STATE.md` § Handoff at closeout (2026-08-24). The Handoff carries open work
only; this is the closed record.

## Outcome

**DONE 2026-08-23, Verifier round 2 PASS** — 10 ✅ / 2 ⚠️ / 0 ❌ (`validation.md` § Round 2), mutation
sensor 3/3 killed. Merged into `main` at `ef23b21` (no-ff, feature HEAD `9e979e1`, 28 commits).

## The four items the entry left open — all resolved

| Open item, as written in the entry | Resolution |
| --- | --- |
| `validation.md` § *"Fix 4 — NOT fixed (still open)"*: `apps/web-next/.next` still tracked, 237 files | **Closed.** `git ls-files apps/web-next/.next` returns **0** at `f00c9b0`. Untracked in `9e979e1` and finished off by the GH013 history rewrite (`git filter-branch --index-filter 'git rm -r --cached --ignore-unmatch apps/web-next/.next'`) |
| worktree `.worktrees/web-stack-next` + branch `feat/web-stack-next` still exist (remove after push) | **Closed** — both removed during the GH013 rewrite (see the second verbatim entry below) |
| tag `v1.1.0` pending user `sim` | **Obsolete** — the remote was already at `v2.2.1`; the `web_stack` entry ships in the changelog's `## v2.3.0` section, and `v2.3.0` was cut and Released 2026-08-24 |
| CI run for `ef23b21` still carries the known `copier` missing on `ubuntu-latest` | **Closed** — the red CI on `main` was diagnosed and fixed 2026-08-24 (`5adf6d7`, `9716c6e`, `095c1cc`) and verified green by CI |

Accepted debt (the two ⚠️) — **settled 2026-08-24, after this archive was written**
(`spec.md` § Amendments, `validation.md` § Closeout):

- ACC-01/ACC-02 now exclude `packages/{eslint,typescript}-config/**`, `pnpm-lock.yaml` and
  `access.guard.spec.ts`, i.e. the intended child-visible change set. Doc-only.
- DOC-03 was both reworded and made true: `AGENTS.md.jinja` and `README.md.jinja` said
  "React/Vite" and "Vite dev" unconditionally, which is wrong in a Next child; all three
  lines now branch on `web_stack`. Vite render byte-identical (probe). Shipped in the
  changelog's `## v2.4.0`.

Final state: 12/12 ACs, 0 ⚠️, 0 ❌.

## Handoff entries, verbatim

- Feature `web-stack-next` — **DONE (2026-08-23). Verifier round 2 PASS** (10 ✅ / 2 ⚠️ / 0 ❌; `validation.md` § Round 2; sensor 3/3 killed). Merged into `main` at `ef23b21` (no-ff, feature HEAD `9e979e1`, 28 commits). Gates at merge: `pnpm check` 0, `pnpm test` (api 332 / web-next 56 / web 68 / eslint-config 28), `test:scripts` 196, web-next cov S 96.74 / B 94.25 / F 97.05 / L 99.06, `template:smoke` vite+next 0, `catalog:check identity --web-stack next` 0, `catalog:check --web-stack vite` 0, bare `docker build` of the next child 0. Side effects: lockfile bumped `typescript-eslint` 8.60→8.67 / eslint 10.4→10.9 (fixed `access.guard.spec.ts` `03f2bac`, catalog identity `access-policy.spec.ts` `0e08d3d` + advisory `ADV-20260823-01`, identity → 1.0.1) — **revertido no merge com `api-coverage-to-90`**: o lockfile resolvido ficou com os pins de `origin/main` (`typescript-eslint` 8.60 / eslint 10.4), os dois specs ficaram na versão Vitest do origin e o defeito de `unbound-method` deixou de existir, então `ADV-20260823-01` foi removido e identity permanece em `2.0.0` (bump do `vitest-migration`); `.next` was committed by T7 and untracked in `9e979e1`. Accepted debt (⚠️): ACC-01/ACC-02 exclusion list must also exclude `packages/{eslint,typescript}-config/**`, `pnpm-lock.yaml`, `access.guard.spec.ts`; DOC-03 AGENTS command table only gains `(front on :3001)` for next. Lessons L-025..L-030 (renumerados duas vezes: L-010..L-015 → L-016..L-021 no merge com `api-coverage-to-90`, e L-016..L-021 → L-025..L-030 no merge de 2026-08-23 com `origin/main`, que já ocupava até L-024). NEXT: worktree `.worktrees/web-stack-next` + branch `feat/web-stack-next` still exist (remove after push); tag `v1.1.0` pending user `sim`; CI run for `ef23b21` still has the known `copier` missing on `ubuntu-latest` (see v1 bullet) — first thing to check after push.

Archived with it because its cause, its artifacts and its resolution are all this feature's (the
secret was committed by **T7**), and it is itself marked *Encerrado*:

- **Push desbloqueado (2026-08-23, GH013 resolvido)** — o secret era um PAT do GitHub (prefixo anotado fora do repo) capturado pelo cache do turbopack em `apps/web-next/.next`, commitado por T7. História reescrita com `git filter-branch --index-filter 'git rm -r -q --cached --ignore-unmatch apps/web-next/.next'` (passos 2–3 do plano feitos; worktree `.worktrees/web-stack-next` e branch `feat/web-stack-next` removidos; backup em `backup/pre-filter-main`). Encerrado: PAT revogado via `POST /credentials/revoke` (2026-08-23, verificado 401; não era o token do gh nem do .npmrc — veio do env do build); backup refs apagados, reflog expirado e `git gc --prune=now` purgou os objetos com o secret; `v1.1.0` obsoleta — remoto já está em v2.2.1 e a entrada web_stack sai no `## v2.3.0` do changelog.
