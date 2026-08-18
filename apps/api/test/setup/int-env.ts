import { ensureDockerRuntimeEnv } from "./docker-runtime"

// Não ligar esta flag no e2e: lá o app boota no DB base (DATABASE_URL) e o
// truncate dos helpers precisa acertar o mesmo banco que o app enxerga.
process.env.TEST_DB_PER_WORKER = "1"

// Repetido aqui (o globalSetup já resolveu no processo pai) porque as suítes de
// Redis sobem container próprio dentro do worker.
ensureDockerRuntimeEnv()
