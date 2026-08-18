import { useSession } from "@/entities/session/api/session.queries"

export function HomePage() {
  const { data } = useSession()

  return (
    <section>
      <h1>Início</h1>
      <p>Sessão ativa: {data?.user.email ?? "—"}</p>
    </section>
  )
}
