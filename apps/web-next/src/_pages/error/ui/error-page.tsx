type Props = {
  error: Error & { digest?: string }
  reset: () => void
}

export default function ErrorPage({ reset }: Props) {
  return (
    <main>
      <h1>Algo deu errado</h1>
      <p>Não foi possível carregar esta página. Tente novamente.</p>
      <button type="button" onClick={reset}>
        Tentar novamente
      </button>
    </main>
  )
}
