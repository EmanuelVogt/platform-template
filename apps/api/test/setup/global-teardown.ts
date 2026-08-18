export default async function globalTeardown(): Promise<void> {
  await globalThis.__redisContainer?.stop()
  await globalThis.__pgContainer?.stop()
}
