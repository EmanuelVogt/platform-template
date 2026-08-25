/**
 * Bloco de env comum aos tiers de teste: o que `env()` exige para bootar em
 * qualquer tier, sem nada que dependa de container. Cada tier acrescenta o que
 * é só dele (URIs dos containers no e2e/int, endereços inertes no unit).
 */
export function applySharedTestEnv(): void {
  process.env.NODE_ENV = "test"
  process.env.LOG_LEVEL = "silent"
  process.env.DATABASE_SSL = "disable"
  process.env.WEB_ORIGIN = "http://localhost:5173"
  process.env.BREACH_CHECK_ENABLED = "false"
  process.env.BREACH_CHECK_MODE = "fail_open"
  process.env.PASSWORD_PEPPER = "test-pepper-test-pepper-test-pepper-0123"
  process.env.CSRF_SECRET = "test-csrf-secret-test-csrf-secret-0123456"
  process.env.COOKIE_SECURE = "false"
  // COOKIE_SECURE=false (dev-over-http) é incompatível com o prefixo __Host-.
  process.env.COOKIE_NAME = "rit_session"
  process.env.DEVICE_COOKIE_NAME = "rit_device"
}
