#!/usr/bin/env bash
# Cobertura combinada real da api: funde unit + integration + e2e num relatório
# só (jest não funde runs de configs diferentes; nyc/istanbul funde por path
# absoluto). Roda em série pra não disputar CPU/Docker do runner. Mede só
# código de produção (exclui specs/d.ts).
set -u
cd "$(dirname "$0")/.."

# O tier e2e roda --runInBand: todas as suítes num processo só, cada uma subindo
# um AppModule, com a instrumentação de cobertura de src/** viva o tempo todo.
# Isso passa dos ~2 GB do heap padrão do V8 e mata o gate com OOM sem nenhum
# teste ter falhado. O runner tem 16 GB — 4 GB dá folga sem esconder vazamento.
export NODE_OPTIONS="${NODE_OPTIONS:-} --max-old-space-size=4096"

OUT=coverage/combined
rm -rf coverage/_unit coverage/_int coverage/_e2e "$OUT"
mkdir -p "$OUT/input" "$OUT/merged"

echo "== [1/3] unit =="
# rootDir do unit é src/ → glob sem prefixo src/, e --coverageDirectory resolve
# relativo a rootDir, daí `../coverage/_unit` (senão cai em src/coverage e some
# do merge). `|| true`: o tier unit tem coverageThreshold (gate); produção-only
# fica abaixo dele, mas o json já foi escrito antes do check — não abortar.
pnpm exec jest --coverage --coverageReporters=json --coverageDirectory=../coverage/_unit \
  --collectCoverageFrom='**/*.ts' \
  --collectCoverageFrom='!**/*.{spec,int-spec,e2e-spec}.ts' \
  --collectCoverageFrom='!**/*.d.ts' || true

echo "== [2/3] integration =="
pnpm exec jest --config test/jest-integration.json --coverage --coverageReporters=json \
  --coverageDirectory=coverage/_int \
  --collectCoverageFrom='src/**/*.ts' \
  --collectCoverageFrom='!src/**/*.{spec,int-spec,e2e-spec}.ts' \
  --collectCoverageFrom='!src/**/*.d.ts'

echo "== [3/3] e2e =="
# Sem --runInBand de propósito: quem serializa é o maxWorkers=1 do config. O
# jest-circus retém a árvore de describe/hook de cada arquivo, e o closure do
# beforeAll segura o app Nest inteiro — app.close() solta socket e timer, não o
# grafo. In-band isso acumula num processo só (3,5 GB sem coverage, OOM com);
# em worker, o workerIdleMemoryLimit do config recicla o processo e limita.
pnpm exec jest --config test/jest-e2e.json --coverage --coverageReporters=json \
  --coverageDirectory=coverage/_e2e \
  --collectCoverageFrom='src/**/*.ts' \
  --collectCoverageFrom='!src/**/*.{spec,int-spec,e2e-spec}.ts' \
  --collectCoverageFrom='!src/**/*.d.ts'

for tier in _unit _int _e2e; do
  src="coverage/$tier/coverage-final.json"
  [ -s "$src" ] || { echo "ERRO: $src ausente/vazio — tier não gerou coverage, merge seria parcial" >&2; exit 1; }
  cp "$src" "$OUT/input/${tier#_}.json"
done

pnpm exec ts-node test/tools/normalize-coverage.ts "$OUT/input"

pnpm exec nyc merge "$OUT/input" "$OUT/merged/coverage.json"

echo ""
echo "===== COBERTURA COMBINADA api (unit + int + e2e) ====="
pnpm exec nyc report --temp-dir "$OUT/merged" --reporter=text-summary --report-dir "$OUT/report"
pnpm exec nyc report --temp-dir "$OUT/merged" --reporter=html --report-dir "$OUT/report" >/dev/null 2>&1
echo "Detalhe por arquivo: apps/api/$OUT/report/index.html"

# Gate anti-erosão (ratchet): só sobe conforme novos testes entram, nunca desce.
# Calibrado sobre o merge normalizado do base-set: 87.13/53.48/91.91/91.98,
# piso ~1.5-2pt abaixo pra não flakar. Falha aqui = CI vermelho.
# Branch alto é inatingível sob @swc/jest: o downlevel de `?.`/`??`/default
# param gera branch implícita que nenhum teste exercita dos dois lados.
echo ""
echo "== gate: nyc check-coverage (combinado) =="
pnpm exec nyc check-coverage --temp-dir "$OUT/merged" \
  --statements 85 --branches 51 --functions 90 --lines 90
