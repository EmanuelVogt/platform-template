// `reflect-metadata` antes de qualquer import de spec: os decorators do Nest
// gravam metadados no carregamento do módulo e o `setupFiles` é o único ponto
// que roda antes deles.
import "reflect-metadata"

// Env mínima para testes unitários (não conectam ao banco). `env()` valida
// tudo no boot e memoiza; sem estas vars, qualquer use-case que chama `env()`
// derruba o teste com "Configuração de ambiente inválida". DATABASE_URL só
// precisa ser uma URL válida — nenhum teste unitário abre conexão.
process.env.NODE_ENV = "test"
process.env.LOG_LEVEL = "silent"
process.env.DATABASE_URL = "postgres://localhost:5432/platform_test"
process.env.REDIS_URL = "redis://:redis@localhost:6379"
process.env.WEB_ORIGIN = "http://localhost:5173"
process.env.PASSWORD_PEPPER = "test-pepper-test-pepper-test-pepper-0123"
process.env.CSRF_SECRET = "test-csrf-secret-test-csrf-secret-0123456"
process.env.BREACH_CHECK_MODE = "fail_open"
process.env.COOKIE_SECURE = "false"
// COOKIE_SECURE=false (dev-over-http) é incompatível com o prefixo __Host-.
process.env.COOKIE_NAME = "rit_session"
process.env.DEVICE_COOKIE_NAME = "rit_device"
