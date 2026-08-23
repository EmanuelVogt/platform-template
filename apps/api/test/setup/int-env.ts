import { ensureDockerRuntimeEnv } from "./docker-runtime"

// `env()` agora exige NODE_ENV/DATABASE_SSL (sem default) — sem eles aqui,
// qualquer int-spec que chama env() derruba no boot.
process.env.NODE_ENV = "test"
process.env.DATABASE_SSL = "disable"
process.env.BREACH_CHECK_ENABLED = "false"

// Não ligar esta flag no e2e: lá o app boota no DB base (DATABASE_URL) e o
// truncate dos helpers precisa acertar o mesmo banco que o app enxerga.
process.env.TEST_DB_PER_WORKER = "1"

// Repetido aqui (o globalSetup já resolveu no processo pai) porque as suítes de
// Redis sobem container próprio dentro do worker.
ensureDockerRuntimeEnv()
