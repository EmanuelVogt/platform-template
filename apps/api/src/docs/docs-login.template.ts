/**
 * Content-Security-Policy aplicado SÓ na resposta da tela de login das docs.
 * Sobrescreve o default do helmet nesta rota: libera estilo inline e as fontes
 * do Google Fonts; nega script (a tela é form puro, sem JS). `form-action 'self'`
 * garante que o POST só sai para a própria origem.
 */
export const DOCS_LOGIN_CSP =
  "default-src 'none'; " +
  "style-src 'unsafe-inline' https://fonts.googleapis.com; " +
  "font-src https://fonts.gstatic.com; " +
  "img-src 'self' data:; " +
  "form-action 'self'; " +
  "base-uri 'none'"

interface DocsLoginView {
  /** Caminho de retorno após autenticar (validado pelo chamador). */
  redirect: string
  /** Mensagem de erro a exibir acima do formulário, quando houver. */
  error?: string
}

/** Escapa texto para interpolação segura em atributo/conteúdo HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/** Renderiza a página de login que protege o acesso ao `/docs`. */
export function renderDocsLoginPage({ redirect, error }: DocsLoginView): string {
  const safeRedirect = escapeHtml(redirect)
  const errorBanner = error
    ? `<p class="error" role="alert">${escapeHtml(error)}</p>`
    : ""

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>Documentação da API</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&family=Quicksand:wght@500;600;700&display=swap" rel="stylesheet" />
<style>
  :root {
    --green-500: #719149;
    --green-600: #5c7a3a;
    --green-700: #485f2e;
    --green-800: #3a4c27;
    --green-900: #2f3d22;
    --green-950: #1d2715;
    --stone-50: #f8f8f4;
    --stone-100: #f0f0ea;
    --stone-200: #e5e6dd;
    --stone-300: #d2d4c8;
    --stone-500: #7e8273;
    --stone-600: #5f6354;
    --ink: #2f3d22;
    --sans: 'Montserrat', system-ui, -apple-system, 'Segoe UI', sans-serif;
    --brand: 'Quicksand', var(--sans);
    --radius: 12px;
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body {
    font-family: var(--sans);
    color: var(--ink);
    background: var(--stone-50);
    display: flex;
    min-height: 100vh;
    -webkit-font-smoothing: antialiased;
  }

  .brand-panel {
    position: relative;
    flex: 1;
    display: none;
    flex-direction: column;
    justify-content: space-between;
    padding: 3rem;
    overflow: hidden;
    color: #fff;
    background: linear-gradient(160deg, var(--green-700), var(--green-950));
  }
  .brand-panel .leaf {
    position: absolute;
    right: -90px;
    bottom: -60px;
    width: 420px;
    color: #fff;
    opacity: 0.08;
    pointer-events: none;
  }
  .wordmark {
    font-family: var(--brand);
    font-weight: 700;
    font-size: 1.7rem;
    letter-spacing: 0.01em;
    position: relative;
    z-index: 1;
  }
  .brand-copy { position: relative; z-index: 1; max-width: 22rem; }
  .brand-copy h1 {
    font-family: var(--brand);
    font-weight: 600;
    font-size: 1.6rem;
    line-height: 1.3;
    margin: 0;
  }
  .brand-copy p {
    margin: 0.9rem 0 0;
    font-size: 0.95rem;
    line-height: 1.6;
    color: rgba(255, 255, 255, 0.75);
  }
  .brand-foot {
    position: relative;
    z-index: 1;
    font-size: 0.78rem;
    color: rgba(255, 255, 255, 0.6);
  }

  .form-panel {
    width: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 3rem 1.5rem;
    background: #fff;
  }
  .form-wrap { width: 100%; max-width: 23rem; margin: 0 auto; }

  .eyebrow {
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--green-600);
  }
  .form-wrap h2 {
    margin: 0.5rem 0 0.3rem;
    font-size: 1.55rem;
    font-weight: 700;
    letter-spacing: -0.01em;
  }
  .subtitle { margin: 0 0 1.6rem; font-size: 0.92rem; color: var(--stone-600); }

  .error {
    margin: 0 0 1.1rem;
    padding: 0.7rem 0.85rem;
    border-radius: var(--radius);
    background: #fcebea;
    border: 1px solid #f1c9c6;
    color: #9b2c2c;
    font-size: 0.85rem;
  }

  .field { margin-bottom: 1.05rem; }
  .field label {
    display: block;
    margin-bottom: 0.4rem;
    font-size: 0.83rem;
    font-weight: 600;
    color: var(--green-900);
  }
  .field input[type="email"],
  .field input[type="password"] {
    width: 100%;
    padding: 0.7rem 0.85rem;
    font-family: var(--sans);
    font-size: 0.95rem;
    color: var(--ink);
    background: var(--stone-50);
    border: 1px solid var(--stone-300);
    border-radius: var(--radius);
    outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  .field input::placeholder { color: var(--stone-500); }
  .field input:focus {
    border-color: var(--green-500);
    box-shadow: 0 0 0 3px rgba(113, 145, 73, 0.18);
    background: #fff;
  }

  .remember {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1.4rem;
    font-size: 0.88rem;
    color: var(--stone-600);
    cursor: pointer;
  }
  .remember input { width: 1rem; height: 1rem; accent-color: var(--green-700); }

  button[type="submit"] {
    width: 100%;
    padding: 0.78rem;
    font-family: var(--sans);
    font-size: 0.95rem;
    font-weight: 600;
    color: #fff;
    background: var(--green-700);
    border: none;
    border-radius: var(--radius);
    cursor: pointer;
    transition: background 0.15s;
  }
  button[type="submit"]:hover { background: var(--green-800); }
  button[type="submit"]:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px rgba(113, 145, 73, 0.35);
  }

  .hint {
    margin: 1.5rem 0 0;
    font-size: 0.8rem;
    line-height: 1.5;
    color: var(--stone-500);
    text-align: center;
  }

  @media (min-width: 1024px) {
    .brand-panel { display: flex; }
    .form-panel { flex: none; width: 30rem; padding: 3rem 3.5rem; }
  }
</style>
</head>
<body>
  <aside class="brand-panel">
    <svg class="leaf" viewBox="0 0 100 100" fill="currentColor" aria-hidden="true">
      <path d="M95 5C55 5 20 25 12 60c-4 18 0 30 0 30s12-30 35-44C70 32 95 28 95 28S70 35 52 52C38 65 28 88 28 88S35 50 95 5Z" />
    </svg>
    <span class="wordmark">Platform</span>
    <div class="brand-copy">
      <h1>Documentação da API</h1>
      <p>Referência viva dos endpoints do backend. Operação, escala e atendimento do resort — também nos bastidores.</p>
    </div>
    <p class="brand-foot">Acesso restrito à equipe</p>
  </aside>

  <main class="form-panel">
    <div class="form-wrap">
      <span class="eyebrow">Acesso da equipe</span>
      <h2>Entrar na documentação</h2>
      <p class="subtitle">Use seu e-mail corporativo para acessar o /docs.</p>

      ${errorBanner}

      <form method="post" action="/docs/login" novalidate>
        <input type="hidden" name="redirect" value="${safeRedirect}" />

        <div class="field">
          <label for="email">E-mail</label>
          <input id="email" name="email" type="email" autocomplete="email"
                 placeholder="voce@example.com" required autofocus />
        </div>

        <div class="field">
          <label for="password">Senha</label>
          <input id="password" name="password" type="password"
                 autocomplete="current-password" placeholder="Sua senha" required />
        </div>

        <label class="remember">
          <input type="checkbox" name="rememberMe" />
          Manter conectado
        </label>

        <button type="submit">Entrar</button>
      </form>

      <p class="hint">Acesso exclusivo para a equipe técnica. Não compartilhe suas credenciais.</p>
    </div>
  </main>
</body>
</html>`
}
