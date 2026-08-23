import { setupServer } from "msw/node"

/**
 * Server MSW compartilhado para testes de integração que exercitam o transporte
 * real do api-client (axios em `@platform/api-client/client`) — intercepta no
 * nível de rede em vez de mockar o hook, então CSRF, onUnauthorized e o
 * mapeamento de erro passam pelo código de produção.
 */
export const server = setupServer()
