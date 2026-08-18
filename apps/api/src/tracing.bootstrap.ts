// Importado primeiro no main.ts: inicia o SDK OTel antes de qualquer módulo
// instrumentado (pg, express) ser carregado, garantindo o patch no require.
import { loadEnv } from "./shared/config/env"
import { loadDotenvForDev } from "./shared/config/load-dotenv"
import { startTracing } from "./shared/kernel/tracing/tracing.setup"

// Carrega o .env local antes de validar; em prod o env já vem do ambiente.
loadDotenvForDev()
// Valida o ambiente antes de tudo: env inválida derruba o processo no boot.
loadEnv()
startTracing()
