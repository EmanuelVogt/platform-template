// Carrega o .env local em dev/test. Em produção o env vem do orquestrador
// (container/secret manager), nunca de arquivo — não tenta carregar.
export function loadDotenvForDev(): void {
  if (process.env.NODE_ENV === "production") {
    return
  }
  try {
    process.loadEnvFile()
  } catch {
    // sem .env local: segue com o env já presente no shell
  }
}
