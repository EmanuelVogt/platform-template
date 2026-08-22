import { containerPostgresUri, containerRedisUri } from "./container-uris"

// Roda antes do test framework em cada worker: aponta o app para os containers.
process.env.DATABASE_URL = containerPostgresUri()
process.env.DATABASE_SSL = "disable"
// Redis efêmero do globalSetup: parte limpo a cada run (sem fail-open por
// ausência de Redis, sem estado de rate-limit vazando entre runs).
process.env.REDIS_URL = containerRedisUri()
process.env.NODE_ENV = "test"
process.env.LOG_LEVEL = "silent"
process.env.BREACH_CHECK_ENABLED = "false"
process.env.OTEL_EXPORTER_OTLP_ENDPOINT = ""
process.env.OTEL_SDK_DISABLED = "true"
process.env.WEB_ORIGIN = "http://localhost:5173"
process.env.PASSWORD_PEPPER = "test-pepper-test-pepper-test-pepper-0123"
process.env.CSRF_SECRET = "test-csrf-secret-test-csrf-secret-0123456"
process.env.BREACH_CHECK_MODE = "fail_open"
process.env.COOKIE_SECURE = "false"
// COOKIE_SECURE=false (dev-over-http) é incompatível com o prefixo __Host-.
process.env.COOKIE_NAME = "rit_session"
process.env.DEVICE_COOKIE_NAME = "rit_device"
// R2 dummy: o StorageModule valida no boot (fail-fast em prod). O storage real
// nunca é exercitado no e2e — quem testa download faz override do OBJECT_STORAGE.
process.env.R2_ACCOUNT_ID = "test-account"
process.env.R2_ACCESS_KEY_ID = "test-key"
process.env.R2_SECRET_ACCESS_KEY = "test-secret"
process.env.R2_BUCKET = "test-bucket"
process.env.R2_ENDPOINT = "https://test.r2.cloudflarestorage.com"
// Mailer: força LogMailer no e2e. O .env de dev usa MAIL_TRANSPORT=resend com
// CHAVE REAL do Resend; sem isto um e2e que dispara e-mail (o DeliveryDispatcher
// roda em background via @Interval) bateria na API real — envio real. Quem
// assevera o efeito do envio faz override do MAILER com um fake.
process.env.MAIL_TRANSPORT = "log"
delete process.env.RESEND_API_KEY
delete process.env.MAIL_FROM
