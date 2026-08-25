// `reflect-metadata` antes de qualquer import de spec: os decorators do Nest
// gravam metadados no carregamento do módulo e o `setupFiles` é o único ponto
// que roda antes deles.
import "reflect-metadata"

import { applySharedTestEnv } from "../../src/shared/test/env"

// Env mínima para testes unitários (não conectam ao banco). `env()` valida
// tudo no boot e memoiza; sem estas vars, qualquer use-case que chama `env()`
// derruba o teste com "Configuração de ambiente inválida". DATABASE_URL só
// precisa ser uma URL válida — nenhum teste unitário abre conexão.
applySharedTestEnv()
process.env.DATABASE_URL = "postgres://localhost:5432/platform_test"
process.env.REDIS_URL = "redis://:redis@localhost:6379"
