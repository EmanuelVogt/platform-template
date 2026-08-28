import { applySharedTestEnv } from "../../src/shared/test/env"

import { containerPostgresUri, containerRedisUri } from "./container-uris"

applySharedTestEnv()

// Roda antes do test framework em cada worker: aponta o app para os containers.
process.env.DATABASE_URL = containerPostgresUri()
// Redis efêmero do globalSetup: parte limpo a cada run (sem fail-open por
// ausência de Redis, sem estado de rate-limit vazando entre runs).
process.env.REDIS_URL = containerRedisUri()
// Fila de espera do pool larga no e2e: há prova de rajada (51 downloads
// simultâneos, sockets do storage) que estouraria o teto fail-closed padrão
// (10 + 20) e devolveria 503 antes de exercitar o que o teste mede. O guard de
// saturação tem prova própria em unit/int — aqui ele só mascararia o assunto.
process.env.DATABASE_POOL_MAX_WAITING = "200"
process.env.OTEL_EXPORTER_OTLP_ENDPOINT = ""
process.env.OTEL_SDK_DISABLED = "true"
// Storage dummy: o StorageModule valida no boot (fail-fast em prod). O storage
// real nunca é exercitado no e2e — quem testa download faz override do OBJECT_STORAGE.
process.env.STORAGE_ACCESS_KEY_ID = "test-key"
process.env.STORAGE_SECRET_ACCESS_KEY = "test-secret"
process.env.STORAGE_BUCKET = "test-bucket"
process.env.STORAGE_ENDPOINT = "https://test.r2.cloudflarestorage.com"
process.env.STORAGE_REGION = "test-region"
// Mailer: força LogMailer no e2e. O .env de dev usa MAIL_TRANSPORT=resend com
// CHAVE REAL do Resend; sem isto um e2e que dispara e-mail (o DeliveryDispatcher
// roda em background via @Interval) bateria na API real — envio real. Quem
// assevera o efeito do envio faz override do MAILER com um fake.
process.env.MAIL_TRANSPORT = "log"
delete process.env.RESEND_API_KEY
delete process.env.MAIL_FROM
