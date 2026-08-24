import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
} from "axios"

/** Subset de AxiosRequestConfig consumido pelos hooks gerados pelo Kubb. */
export type RequestConfig<TData = unknown> = {
  baseURL?: string
  url?: string
  method?: "GET" | "PUT" | "PATCH" | "POST" | "DELETE" | "OPTIONS" | "HEAD"
  params?: unknown
  data?: TData | FormData
  responseType?:
    | "arraybuffer"
    | "blob"
    | "document"
    | "json"
    | "text"
    | "stream"
  signal?: AbortSignal
  headers?: AxiosRequestConfig["headers"]
  onUploadProgress?: (event: { loaded: number; total?: number }) => void
}

/** Subset de AxiosResponse devolvido aos hooks (que acessam `.data`). */
export type ResponseConfig<TData = unknown> = {
  data: TData
  status: number
  statusText: string
  headers: AxiosResponse["headers"]
}

export type ResponseErrorConfig<TError = unknown> = AxiosError<TError>

// Array em query = chave repetida (`ids=a&ids=b`), NUNCA o default do axios
// (`ids[]=a`): o query parser "simple" do Express não junta colchetes e o DTO
// recebe undefined — filtro vira no-op silencioso.
function serializeParams(params: Record<string, unknown>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) {
      for (const item of value) search.append(key, String(item))
    } else {
      search.append(key, String(value))
    }
  }
  return search.toString()
}

/** Instância axios compartilhada pelos hooks. credentials sempre incluídos (spec §0.6). */
export const instance: AxiosInstance = axios.create({
  withCredentials: true,
  paramsSerializer: { serialize: serializeParams },
})

const MUTATING_METHODS = new Set(["post", "put", "patch", "delete"])

/** Lê o cookie rit_csrf (legível por JS, emitido no login e no GET /auth/session
 *  sob SameSite=None — ADR 0015). Sob SameSite=Lax/Strict o cookie não existe. */
function readCsrfToken(): string | null {
  if (typeof document === "undefined") return null
  const match = document.cookie.match(/(?:^|;\s*)rit_csrf=([^;]*)/)
  return match ? decodeURIComponent(match[1] ?? "") : null
}

// Double-submit do CsrfGuard: reflete rit_csrf em X-CSRF-Token em toda mutação
// (ADR 0015 §37). Sob SameSite=Lax (dev) o cookie não existe → header omitido →
// guard ignora. O transporte cuida do header — não é parâmetro por operação.
instance.interceptors.request.use((config) => {
  const method = config.method?.toLowerCase()
  if (method !== undefined && MUTATING_METHODS.has(method)) {
    const token = readCsrfToken()
    if (token !== null) {
      config.headers.set("X-CSRF-Token", token)
    }
  }
  return config
})

let lastErrorCorrelationId: string | null = null

/** correlationId (RFC 7807) da última resposta de erro da API — consumido pelo
 *  formulário de feedback para amarrar o relato ao log do erro. */
export function getLastErrorCorrelationId(): string | null {
  return lastErrorCorrelationId
}

instance.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error)) {
      const data: unknown = error.response?.data
      if (
        typeof data === "object" &&
        data !== null &&
        "correlationId" in data &&
        typeof (data as { correlationId: unknown }).correlationId === "string"
      ) {
        lastErrorCorrelationId = (data as { correlationId: string })
          .correlationId
      }
    }
    return Promise.reject(error)
  }
)

export type ConfigureClientOptions = {
  baseURL: string
  /** Chamado em todo 401. Recebe a `url` da request que falhou para o caller
   *  decidir a política (ex.: ignorar o 401 do próprio probe de sessão). */
  onUnauthorized?: (context: { url?: string }) => void
}

/**
 * Configura o client em runtime (chamado no bootstrap do front).
 * Define a baseURL e instala o interceptor de 401 → callback (limpa cache/redireciona).
 */
export function configureClient(options: ConfigureClientOptions): void {
  instance.defaults.baseURL = options.baseURL
  const onUnauthorized = options.onUnauthorized
  if (onUnauthorized) {
    instance.interceptors.response.use(
      (response) => response,
      (error: unknown) => {
        if (axios.isAxiosError(error) && error.response?.status === 401) {
          onUnauthorized({ url: error.config?.url })
        }
        return Promise.reject(error)
      }
    )
  }
}

/**
 * Adapter consumido pelos hooks gerados pelo Kubb: dispara a request via axios
 * e devolve o response (o hook lê `.data`).
 */
const client = async <TData, _TError = unknown, TVariables = unknown>(
  config: RequestConfig<TVariables>
): Promise<ResponseConfig<TData>> => {
  const response = await instance.request<TData>(config as AxiosRequestConfig)
  return {
    data: response.data,
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  }
}

export { client }
export default client
