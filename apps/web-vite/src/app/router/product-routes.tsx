import type { AnyRoute } from "@tanstack/react-router"

/**
 * Ponto de extensão do produto. Cada produto construído sobre este template
 * acrescenta aqui as próprias rotas — elas entram como filhas do layout
 * autenticado (`authenticatedLayoutRoute`), ao lado de `/inicio`. O template
 * sobe com a lista vazia de propósito: a base não conhece nenhum produto.
 */
export const productRoutes: AnyRoute[] = []
