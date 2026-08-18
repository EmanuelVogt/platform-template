# Frontend — Heurísticas e Guidelines (FSD)

> **Nota do template.** O front gerado é *headless*: só transporte, sessão, guard e login
> sem estilo. As seções sobre FSD completo, formulários, listagem e design system descrevem a
> arquitetura de referência de um front completo — valem se o produto adotar essa pilha;
> as regras de contrato (Kubb), transporte, sessão e roteamento valem sempre.

Handbook. Stack: **React + Vite + TanStack Query + React Hook Form + Zod + `@platform/api-client` (Kubb)**. Arquitetura: **Feature-Sliced Design**.

## Princípios

1. **FSD canônico** — 6 layers, dependência top-down.
2. **Slice não importa slice vizinho** — compartilhamento sobe ou desce.
3. **Sem barrel — deep import.** Import direto do arquivo que define o símbolo; `index.ts`/`index.tsx` agregador de slice ou segmento é proibido. Sobrescreve a "public API via `index`" do FSD — vale só aqui.
4. **`@platform/api-client` é externo** — só em `entities/<resource>/api/`.
5. **Server state = TanStack Query.** Sem `useState`/store global pra dado de API.
6. **Validação no boundary** — Zod do `api-client` em form (ou schema local + transform).
7. **`ui/` dumb por padrão** — orquestração em `model/`.
8. **Boot centralizado** — `configureApiClient`, `QueryClient`, providers em `app/`.
9. **Roteador = TanStack Router** — type-safe, code splitting via `createLazyFileRoute` ou `React.lazy`.
10. **Wrap só quando agrega.** Re-export trivial > wrap inútil (YAGNI).

## Camadas

| Layer        | Propósito                                                   | Importa de                          |
| ------------ | ----------------------------------------------------------- | ----------------------------------- |
| `app/`       | Bootstrap, providers, roteador, estilos                     | todas                               |
| `pages/`     | Rotas. Compõe widgets/features/entities.                    | widgets, features, entities, shared |
| `widgets/`   | Blocos compostos reutilizáveis                              | features, entities, shared          |
| `features/`  | Ação do usuário (pay-invoice, register-user)                | entities, shared                    |
| `entities/`  | Modelo de domínio (1:1 com módulo backend)                  | shared                              |
| `shared/`    | UI kit, libs, config — sem domínio                          | nada                                |

`entities/invoice/` **não** conhece `entities/user/`. Composição vive em widget/feature/page.

## Estrutura

```
apps/web/src/
├── app/
│   ├── providers/      QueryClientProvider, RouterProvider, ThemeProvider
│   ├── router/         routes.tsx (tabela)
│   ├── config/         api-client.ts (configureApiClient, boot único)
│   ├── styles/
│   └── index.tsx       createRoot
├── pages/<slice>/
│   └── ui/<slice>-page.tsx
├── widgets/<slice>/
│   ├── ui/             componente do widget
│   └── model/          hooks de orquestração
├── features/<action>/
│   ├── ui/             form/botão/painel
│   └── model/          use<Action>.ts + (schema local se diferir)
├── entities/<resource>/
│   ├── api/            queries.ts (wrap api-client) + keys.ts
│   ├── model/          types.ts + selectors.ts
│   └── ui/             cards, badges (dumb)
└── shared/
    ├── ui/             composições app-specific (AuthField, PasswordField) — kit primitivo em @workspace/ui
    ├── lib/            utils (cn, format-currency, date)
    ├── store/          Zustand stores cliente-side (tema, sidebar, layout)
    ├── config/         env.ts (Zod), routes.ts (paths)
    ├── types/          ids branded, primitives compartilhados
    └── api/            http helpers
```

## Segments do slice

| Segment    | Conteúdo                                                       |
| ---------- | -------------------------------------------------------------- |
| `ui/`      | Componentes React (apresentação)                               |
| `model/`   | Hooks, stores, schemas locais, orquestração                    |
| `api/`     | Wrap de hooks gerados + query keys                             |
| `lib/`     | Utilitários internos do slice                                  |
| `config/`  | Constantes do slice                                            |

Crie só o que precisa. `entities/invoice/` tem `api/ + model/ + ui/`; `features/filter-invoices/` pode ter só `ui/ + model/`.

## Imports — sem barrel (deep import)

Proibido `index.ts`/`index.tsx` agregador (barrel) de slice ou segmento. Import sempre **direto do arquivo que define o símbolo**. Sobrescreve a "public API via `index`" do FSD — o handbook segue o FSD em tudo menos neste ponto.

```typescript
// ✅ correto — direto do arquivo
import { UserStatusBadge } from '@/entities/user/ui/user-status-badge';
import { useUsers } from '@/entities/user/api/user.queries';
import type { User } from '@/entities/user/model/user.types';

// ❌ proibido — barrel agregador
import { UserStatusBadge, useUsers } from '@/entities/user';
```

O gerado pelo Kubb idem: import direto de `@platform/api-client/hooks/*` | `zod/*` | `models/*`, nunca re-exportado por arquivo do front.

**Enforcement.** Direção de layer e veto a slice irmão são checados por `eslint-plugin-boundaries` (config em `packages/eslint-config/fsd.js`, consumido só pelo web via `@workspace/eslint-config/fsd`): camada só importa de camada abaixo; slice irmão é erro; import dentro do próprio slice é livre. Exceção única: `entities/*/api/*.keys.ts` (categoria `keys`) pode ser importado por outra entity — invalidação de cache cruza domínios (Regra 7). O lint de import (`eslint-plugin-import-x`) segue cobrindo ordem, ciclo (`no-cycle`), self-import e duplicata. Ausência de barrel permanece convenção + review — reforçada pela própria ausência de arquivos `index` agregadores. JSDoc pt-BR num export consumido fora do slice só quando o contrato não é óbvio pela assinatura (idempotência, side-effect, ordering).

## Mapeamento backend ↔ FSD

| Backend module (tag)                  | FSD entity              |
| ------------------------------------- | ----------------------- |
| `billing` (`invoices`)                | `entities/invoice/`     |
| `identity` (`users`)                  | `entities/user/`        |
| `shipping` (`shipments`)              | `entities/shipment/`    |
| `reporting` (read models)             | `entities/<projection>/` ou widget composto |

Cada entity **wrapa** a tag correspondente do `@platform/api-client`. App nunca importa direto.

## Entity api/ — wrap do api-client

**Wrap só quando agrega valor.** Re-export trivial > wrap inútil (YAGNI).

Wrap quando adiciona:
- `onSuccess`/`onError`/`invalidateQueries`.
- `select` para transform de dado.
- Override de `staleTime`/`gcTime` por endpoint.
- Map de erro do `api-client` pra erro de UI.

Caso contrário: re-export direto.

```typescript
// entities/invoice/api/invoice.keys.ts
import { getInvoiceQueryKey } from '@platform/api-client/hooks/useGetInvoice';
import { listInvoicesQueryKey } from '@platform/api-client/hooks/useListInvoices';

// list/detail reusam as keys geradas pelo Kubb (object-shaped). Key manual
// `[...all, 'detail', id]` NÃO casa o cache do hook → invalidateQueries vira no-op
// silencioso. `all` é só rótulo, não prefixo de invalidação. Ver ADR 0031.
export const invoiceKeys = {
  all: ['invoices'] as const,
  list: () => listInvoicesQueryKey(),
  detail: (id: string) => getInvoiceQueryKey(id),
};

// entities/invoice/api/invoice.queries.ts
import { useInvoicesControllerGetV1 } from '@platform/api-client/hooks/useInvoicesControllerGetV1';
import { useInvoicesControllerListV1 } from '@platform/api-client/hooks/useInvoicesControllerListV1';
import { useInvoicesControllerPayV1 as usePayInvoiceMutation } from '@platform/api-client/hooks/useInvoicesControllerPayV1';
import { useQueryClient } from '@tanstack/react-query';
import { invoiceKeys } from './invoice.keys';

// re-export com rename (wrap não agrega):
export { useInvoicesControllerGetV1 as useInvoice, useInvoicesControllerListV1 as useInvoices };

// wrap (agrega invalidation):
export const usePayInvoice = () => {
  const qc = useQueryClient();
  return usePayInvoiceMutation({
    mutation: {
      onSuccess: (_data, vars) => {
        qc.invalidateQueries({ queryKey: invoiceKeys.detail(vars.id) });
        qc.invalidateQueries({ queryKey: invoiceKeys.list() });
      },
    },
  });
};
```

Single point pra invalidations + query keys. Tree-shaking preservado (import nomeado).

## Form — RHF + Zod do api-client

```typescript
// features/pay-invoice/ui/pay-invoice-form.tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { invoicesControllerPayV1Schema as payInvoiceBodySchema } from '@platform/api-client/zod/invoicesControllerPayV1Schema';
import type { PayInvoiceBody } from '@platform/api-client/models/PayInvoiceBody';
import { usePayInvoice } from '@/entities/invoice/api/invoice.queries';
import { Button } from '@workspace/ui/components/button';
import { Input } from '@workspace/ui/components/input';

export const PayInvoiceForm = ({ invoiceId, onSuccess }: { invoiceId: string; onSuccess?: () => void }) => {
  const { mutate, isPending } = usePayInvoice();
  const { register, handleSubmit, formState: { errors } } = useForm<PayInvoiceBody>({
    resolver: zodResolver(payInvoiceBodySchema),
  });

  const onSubmit = (body: PayInvoiceBody) =>
    mutate({ id: invoiceId, data: body }, { onSuccess });

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Input {...register('amount', { valueAsNumber: true })} error={errors.amount?.message} label="Valor" />
      <Button type="submit" loading={isPending}>Pagar</Button>
    </form>
  );
};
```

- Forma do form = body da API → schema do `@platform/api-client/zod/*`.
- Forma divergente → schema local + `toBody()` (exemplo abaixo).
- `Idempotency-Key` é **do caller**: não existe interceptor injetando (o `client.ts` cuida de CSRF e correlação, não de idempotência). Rota que precisa dedup expõe o header no contrato e a feature gera a chave — ver "Idempotência" abaixo.

### Campos de form — `shared/ui/form/`

Campos controlados por RHF moram em `shared/ui/form/` como biblioteca reutilizável (genéricos sobre `FieldValues`, recebem `control` + `name`, ligam via `useController`): `RhfTextField`, `RhfPasswordField`, `RhfSelect`, `RhfTriStateSelect`, `RhfCheckboxField`, `RhfDateField`. `RhfTextField`/`RhfPasswordField` reaproveitam por dentro os primitivos `AuthField`/`PasswordField`. O form **não repete** `register`/`Controller` por campo — compõe o campo pronto e o erro sai do `fieldState` (não passar `error` à mão):

```tsx
<RhfTextField control={form.control} name="email" label="E-mail" icon={Mail} />
<RhfSelect control={form.control} name="sex" label="Sexo" options={SEX_OPTIONS} />
```

- **Todo campo de form abstraído aqui.** Falta um tipo (textarea, currency…)? Adicionar em `shared/ui/form/` (um por arquivo, prefixo `Rhf*`), nunca inline na feature.
- **Campo de dinheiro SEMPRE mascarado.** Nunca `Input` de texto livre para valor financeiro. O sistema: `maskMoneyBrl` (`shared/lib/masks.ts`) — o form guarda **só dígitos, que são os centavos** ("180050" exibe "R$ 1.800,50", preenche da direita pra esquerda). Campo com label → `RhfTextField` com `mask={maskMoneyBrl}` + `inputMode="numeric"`; campo compacto/inline (editor de linhas) → `MoneyInput` (`shared/ui/form/money-input.tsx`). Conversão de/para o contrato (`*Cents` int) com `digitsToCents`/`centsToDigits`; exibição read-only com `formatBrl` (`shared/lib/money.ts`). Referências: `ProductDrawer` (preço do programa), `PriceBracketEditor` (faixas do tipo de acomodação).
- Campos são **controlados** (`value` + `onChange`); **não** acessar `field.ref` no render — o React Compiler barra (`Cannot access refs during render`). Abre-se mão do foco-no-erro conscientemente.
- `RhfTextField` reaproveita o `AuthField` (label + ícone + erro) por dentro — primitivo único, binding RHF por cima.
- Form longo/multi-step compõe os mesmos campos em `ui/steps/*` (ver `features/guest-form`).

### Schema local com transform

Quando UI tem campo que diverge do body (string vira number, máscara, união discriminada):

```typescript
// features/pay-invoice/model/pay-invoice.schema.ts
import { z } from 'zod';
import type { PayInvoiceBody } from '@platform/api-client/models/PayInvoiceBody';

export const payInvoiceFormSchema = z.object({
  amountString: z.string().min(1, 'informe um valor'),
});

export type PayInvoiceFormInput = z.input<typeof payInvoiceFormSchema>;
export type PayInvoiceFormOutput = z.output<typeof payInvoiceFormSchema>;

export const toPayInvoiceBody = (form: PayInvoiceFormOutput): PayInvoiceBody => ({
  amount: Number(form.amountString.replace(',', '.')),
});
```

```typescript
// features/pay-invoice/ui/pay-invoice-form.tsx
const { register, handleSubmit } = useForm<PayInvoiceFormInput, unknown, PayInvoiceFormOutput>({
  resolver: zodResolver(payInvoiceFormSchema),
});

const onSubmit = (form: PayInvoiceFormOutput) =>
  mutate({ id: invoiceId, data: toPayInvoiceBody(form) }, { onSuccess });
```

**`useForm<Input, Context, Output>` (RHF v7+)** quando schema tem `.transform()`/`.coerce.*` — separa tipo do registro (input cru) do tipo após parse (output). Sem isso, RHF erra inferência em form com transform.

## Enum do contrato

Valor de enum que existe no contrato (`status`, `kind`, `type`, `category`) **nunca** é digitado no front. A fonte é a const gerada pelo plugin-ts do Kubb em `@platform/api-client/models/*` — objeto de runtime **e** tipo:

```typescript
// packages/api-client/generated/models/ListFeedbacks.ts (gerado)
export const listFeedbacksQueryParamsStatusEnum = { new: "new", in_review: "in_review", … } as const;
export type ListFeedbacksQueryParamsStatusEnum = (typeof listFeedbacksQueryParamsStatusEnum)[keyof typeof listFeedbacksQueryParamsStatusEnum];
```

**Um descritor por conceito** (`defineEnum`, em `shared/lib/enum-descriptor.ts`), na entity dona do assunto (`entities/<x>/model/<x>-labels.ts`). Ele reúne o que a UI precisa saber sobre aquele enum: o rótulo em pt-BR (obrigatório por valor) e a cor do selo (opcional).

```typescript
// entities/feedback/model/feedback-labels.ts
export const feedbackStatus = defineEnum(listFeedbacksQueryParamsStatusEnum, {
  new: { label: 'Novo', badge: 'info' },
  in_review: { label: 'Aceito', badge: 'success' },
  …
});

// Recorte por outro enum do contrato — não repete rótulo
export const manualFeedbackStatus = feedbackStatus.pick(updateFeedbackStatusDtoStatusEnum);

// Tela que diverge troca só o que muda e herda o resto
export const authorFeedbackStatus = feedbackStatus.override({ new: 'Enviado' });
```

No consumo: `descritor.options` (select e filtro), `descritor.label(v)`, `descritor.badge(v)`, `descritor.values` (guarda de tipo). Schema local usa `z.enum(constGerada)` direto.

**Por que a const de `models/*` e não o schema de `zod/*`:** o Kubb fecha o schema com `as unknown as ToZod<Dto>`, e esse cast mapeia união de literais para `z.ZodType<…>` — `.options` existe em runtime mas **não no tipo**. Derivar do zod exigiria cast; derivar da const não exige nada.

O `Record` completo de entradas é o que dá exaustividade: nasceu membro novo no contrato, o build quebra pedindo o rótulo. Sem isso o valor novo circula no sistema e some da tela — filtro que não lista, selo sem cor, texto cru em português quebrado.

**Nunca copie o descritor para divergir numa tela.** Foi assim que a tela de quem envia relato duplicou os cinco rótulos e o mapa de cores inteiro só para trocar uma palavra. Divergência é `.override()`; subconjunto é `.pick()`.

**Exceção** existe (a trilha de auditoria traduz valor que o domínio já aposentou, e derivar apagaria o histórico) e mora declarada em `apps/web/test/contract-enums.test.ts`, com motivo escrito. Fora dali, a trava reprova em três frentes: valor redigitado, mapa de rótulos sem amarração e enum descrito em mais de um arquivo — sempre apontando arquivo, linha e o ponto do contrato copiado.

Dimensão que **não** é rótulo nem cor de selo (cor nomeada de vendor no scheduler, rota inicial por perfil, texto longo de formulário) continua livre para morar onde fizer sentido.

Conjunto fechado que **não** existe no contrato — camada de mapa, escala da agenda, aba de tela — é UI pura e segue como literal local.

## Select

O `Select` de `@workspace/ui` é **fechado**: recebe `items` e desenha trigger, popup e opções. Não existe `SelectTrigger`/`SelectContent`/`SelectItem` para montar à mão — é o que garante que o que está na tela e o que resolve o rótulo sejam a mesma lista.

```tsx
<Select
  items={AREA_OPTIONS}
  value={areaId}
  onValueChange={setAreaId}
  aria-label="Área"
  placeholder="Selecione a área"
  emptyMessage="Nenhuma área encontrada"
/>
```

Por baixo é Base UI, onde `Select.Value` **não** lê o texto do item selecionado (diferente do molde clássico do shadcn, que pressupõe Radix — nunca usado aqui): o rótulo sai de `items`, e sem ela o campo renderiza o valor cru (`in_review`, um UUID). Enum do contrato entra por `enumOptions` (Regra de Ouro 23); lista de entidade vem da query, já mapeada para `{ value, label }`.

Props do item: `value`, `label`, `disabled?`, `className?`. Composição por item (ponto de cor, ícone) vai em `renderItem` — vale no popup **e** no trigger, então o campo fechado não diverge da opção aberta. Do campo: `id` (para o `htmlFor` do `Label`), `aria-label`, `className`, `invalid`, `placeholder`, `emptyMessage`.

**Valor selecionado que não está em `items`** é o segundo caminho para o id na tela, e não depende da biblioteca: a query ainda carrega, a lista foi filtrada (só ativos, só livres no período) ou o registro escolhido foi desativado depois. O kit não deixa vazar — cai no `placeholder` —, mas isso esconde informação. Quem tem o dado resolve o rótulo de verdade:

- buscar o registro pelo id quando ele não está na lista (`useGetArea` no mapa por área);
- injetar a opção do valor atual na lista (`withCurrentOption` no encaixe de atendimento; "Acomodação selecionada" no formulário de reserva).

**Rótulo de fallback é sempre texto em português** — "Tag indisponível", "Opção selecionada", "O profissional". `?? id`, `label: value` e `found.set(id, id)` são proibidos: transformam um dado técnico em texto de tela. Vale para qualquer superfície, não só o select — chip de tag, combo com busca, frase de diálogo.

`items` é sempre lista de `{ value, label }` — o kit não aceita o mapa `Record<value, label>` do Base UI, para não haver dois formatos com resolução diferente. Mapa de rótulos vira lista no call site (`enumOptions`, `.map`). Opção "Todos" entra como item de valor nulo (`{ value: null, label: "Todos os tipos" }`), não como item avulso desenhado por fora.

Multi-seleção não passa pelo `Select` (o kit fixa seleção única): usar `shared/ui/form/multi-select.tsx`. `isItemEqualToValue` também fica fora — comparação customizada valeria no popup e não no resolve do rótulo.

**Importar `@base-ui/react/*` em `apps/web` é erro de lint** (`no-restricted-imports`): o primitivo cru não carrega a regra do kit, e usá-lo direto reintroduz o defeito por fora do wrapper. Falta um primitivo? Adicionar em `packages/ui/src/components/`.

## Estado

| Tipo                                   | Onde mora                          |
| -------------------------------------- | ---------------------------------- |
| Dado da API                            | TanStack Query (via entity)        |
| Visual local (modal, aba, foco)        | `useState` / `useReducer`          |
| Cliente compartilhado (tema, sidebar)  | Zustand em `shared/store/`         |
| Form em edição                         | React Hook Form                    |
| Derivado de dado da API                | `select` do TanStack Query         |
| URL (filtros, paginação, aba)          | search params (router)             |

**Server state nunca em store global.**

### Tipos de ID compartilhados

Moram em `shared/types/ids.ts` como branded types — evita que `entities/A` importe `entities/B` só pra usar `B.id`:

```typescript
// shared/types/ids.ts
export type InvoiceId  = string & { readonly __brand: 'InvoiceId' };
export type CustomerId = string & { readonly __brand: 'CustomerId' };
export type UserId     = string & { readonly __brand: 'UserId' };
```

`entities/invoice/model/invoice.types.ts` re-exporta `InvoiceId`. `Invoice.customerId: CustomerId` não obriga `entities/invoice` a conhecer `entities/customer`.

## Bootstrap (`app/`)

- `configureApiClient({ baseURL, getToken, onUnauthorized })` em `app/config/api-client.ts`, importado como side-effect no `app/index.tsx`.
- `QueryClient` defaults: `staleTime: 10_000` (10s — conservador), `gcTime: 5 * 60_000`, `retry: 1`, `refetchOnWindowFocus: true`, `refetchOnReconnect: true`. Per-query sobe `staleTime` quando dado é imutável (`Infinity`) ou raramente muda.
- Providers em ordem: `QueryClientProvider` → `ThemeProvider` → `RouterProvider`.
- **Roteador = TanStack Router** (`@tanstack/react-router`). `app/router/routes.tsx` registra `createRouter`; rotas em `app/router/routes/` (file-based) ou inline (code-based). Code splitting via `createLazyFileRoute` ou `React.lazy`.
- Env via `shared/config/env.ts` parseando `import.meta.env` com Zod (fail-fast no boot).
- Vite: alias `@/ → src/`, `target: 'es2022'`, `sourcemap: true`.

## Imports do `api-client`

Kubb emite **um símbolo por arquivo de subpath**: hook em `@platform/api-client/hooks/<useXControllerYV1>`, schema zod em `@platform/api-client/zod/<schema>`, tipo em `@platform/api-client/models/<Type>`. Import direto do arquivo — nunca do barrel raiz, nunca re-exportado pelo front.

```typescript
// ✅ dentro de entities/user/api/
import { useUsersControllerListV1 } from '@platform/api-client/hooks/useUsersControllerListV1';
import { usersControllerCreateV1Schema } from '@platform/api-client/zod/usersControllerCreateV1Schema';
import type { UserResponseDto } from '@platform/api-client/models/UserResponseDto';

// ✅ em features/widgets/pages — consome o wrapper da entity (deep import)
import { useUsers } from '@/entities/user/api/user.queries';

// ❌ em features/widgets/pages — api-client cru fora de entities/<resource>/api/
import { useUsersControllerListV1 } from '@platform/api-client/hooks/useUsersControllerListV1';
```

Exceção: `app/config/api-client.ts` importa `configureApiClient` do barrel raiz do pacote.

## Kernel da aplicação — Isolamento do shell e `shared/`

A arquitetura da web também distingue camadas de kernel (base-set) e produto:

- **`shared/`** (UI kit, libs, config — sem domínio) nunca importa de `pages/`, `features/` ou `entities/` exceto `entities/session/` (identidade). Compartilhamento de UI específica de domínio sobe para widget/feature/page.
- **App shell** (`app/config`, `app/providers`, `app/router/{shell.tsx, guards, router.tsx}`) importa de `@platform/api-client` **apenas** o cliente de transporte e tipos de identidade/sessão. Qualquer schema específico de produto (hospedagem, agenda, serviço) não entra aqui; shells não conhecem o domínio.
- **Roteador split** — `router.tsx` monta `shell.tsx` (rotas públicas + autenticadas base-set: login, reset, home, perfil) + `product-routes.tsx` (todas as entidades e fluxos de negócio). Assim, o shell encapsula autenticação e permissão sem acoplamento à agenda ou às políticas de disponibilidade.

Ambas as travas (compartimentalização de imports e roteador split) são **verificadas por `apps/web/test/kernel-boundary.test.ts`**.

## Idempotência — geração de key

**Não há interceptor de idempotência.** `packages/api-client/src/client.ts` injeta CSRF e correlação; `Idempotency-Key` é responsabilidade do **caller**, por operação.

- A rota que quer dedup declara `@Idempotent({ ttlHours })` no back. O Kubb então costura o header na `variables` da mutation (`{ data, headers }`), e o wrapper do front passa a chave explicitamente.
- Key = **um valor por tentativa manual** (`crypto.randomUUID()`), reusado num retry de transporte da mesma tentativa. Novo clique = nova tentativa = nova key.
- Por isso `@Idempotent` só entra em **rota com corpo**: mutation sem corpo quebraria ao destructurar `{ headers }` (ADR 0023).
- Front nunca lê a key; é opaca. Backend valida `request_hash` (SHA-256 do body canônico).
- Exemplo vivo: `useCreateAgendaGenerationJob` em `entities/guest-appointment/api/agenda-generation-job.queries.ts` (ADR 0066).

## Correlation ID

- Origem: **front gera ULID na inicialização da aba** e armazena em `sessionStorage['correlationId']`.
- Interceptor do `api-client` injeta `X-Correlation-Id` em **todo** request (query + mutation).
- Backend usa o header pra popular `RequestContext.correlationId`. Persiste em log/trace.
- Erro RFC 7807 do backend devolve `correlationId` no envelope — front exibe no toast/log de suporte.
- Refresh da página gera novo ID (nova "sessão" de debug). SPA navigation mantém.

## Acesso por rota e permissão

- `shared/config/route-access.ts` é a fonte única: `ROUTE_ACCESS` mapeia todo
  `RoutePath` para `{ kind: "public" | "self" | "permission" }`;
  `ACCESS_PROFILE_HOME` dá a home por perfil.
- **`staticData.access` é obrigatório em toda `createRoute`** — module
  augmentation de `StaticDataRouteOption` (`app/router/access.d.ts`) faz o
  typecheck barrar rota nova sem declaração. O guard único (`requireAccess`, no
  `beforeLoad` do layout autenticado) lê o `access` da rota folha em `matches`
  e redireciona sem loop (cadeia: intenção → última rota → home do perfil →
  `DEVICES`).
- `can(user, key)` / `useCan()` vivem em `entities/session/model/permissions`
  e leem o cache da sessão (master bypassa). Botão/ação mutável é gated por
  `useCan` — convenção de review, sem enforcement de compile.
- Item de nav (`shared/config/navigation.ts`) declara `permission` obrigatória;
  `visibleSections(canKey)` filtra itens e some com seção vazia (o `to` da
  seção deriva do primeiro item visível).
- Detalhe e decisões no [ADR-0028](../adr/0028-modelo-de-autorizacao.md).

## Nomenclatura

```
arquivos / pastas:   kebab-case        invoice-card.tsx, pay-invoice/
componentes:         PascalCase        InvoiceCard
hooks:               camelCase use*    useInvoice, usePayInvoice
stores Zustand:      use<Slice>Store   useThemeStore
query keys:          <resource>Keys    invoiceKeys
schemas Zod:         <action>Schema    payInvoiceBodySchema
types:               PascalCase        PayInvoiceBody, InvoiceStatus
```

## Decisões rápidas

### Onde criar X

```
Primitive sem domínio (Button, Input, Card)?            → packages/ui (@workspace/ui)
Composição app-specific (AuthField)?                    → shared/ui/
Campo de form controlado (texto/select/checkbox/data)?  → shared/ui/form/ (Rhf*)
Componente exibindo entidade (InvoiceCard, UserAvatar)? → entities/<resource>/ui/
Model/UI de form reusado por 2+ features?               → entities/<resource>/ (model/ + ui/)
Bloco composto reutilizável (Header, InvoiceListBlock)? → widgets/<slice>/
Form ou ação do usuário?                                → features/<action>/
Rota?                                                   → pages/<slice>/
Hook consumindo 1 endpoint?                             → entities/<resource>/api/
Hook combinando 2+ endpoints?                           → features/<action>/model/ ou widgets/<slice>/model/
Util cross-feature?                                     → shared/lib/
Config / env?                                           → shared/config/
Store cliente (tema, sidebar)?                          → shared/store/<store>.ts (Zustand)
Tipo de ID compartilhado?                               → shared/types/ids.ts (branded)
Configuração global (QueryClient, Router)?              → app/
```

> **Primitiva de form compartilhada = entity, nunca feature.** Se um editor/schema/mapper de form é reusado por 2+ features, ele **não** pode morar numa feature (feature↔feature é proibido, Princípio 2). Exemplo: `entities/schedule-slot/` (`model/slot-types`, `model/interval`, `ui/weekly-intervals-editor`) — o editor de intervalos semanais tipados é consumido pela config do profissional, template global, funcionamento da clínica e horário de área; cada feature guarda só o que é seu (bloqueios pontuais, toggle de herança, mapeamento pro DTO da superfície).

### Schema Zod: api-client ou local?

```
Forma do form = body da API?    → @platform/api-client/zod/*
Forma difere?                   → features/<feature>/model/<feature>.schema.ts + transform
```

### Hook: entity ou feature?

```
Wrap 1 endpoint + invalidations?         → entities/<resource>/api/
Combinar 2+ entities + orquestração UI?  → features/<action>/model/ ou widgets/<slice>/model/
Lógica de página?                        → pages/<slice>/ui/ ou widgets/<slice>/model/
```

### Estado

```
Dado da API?               → TanStack Query (via entity)
Visual local?              → useState
URL (filtro, paginação)?   → search params
Cliente global (tema)?     → Zustand em shared/
Form em edição?            → React Hook Form
Derivado da API?           → select do TanStack Query
```

### UI kit: packages/ ou shared/?

```
Primitive reusável (Button, Sheet, Table, Dialog)?       → packages/ui (@workspace/ui) + .stories.tsx
Composição app-specific (AuthField, SetPasswordFields)?  → apps/web/src/shared/ui/
```
Kit primitivo mora em `packages/ui` (`@workspace/ui`) mesmo com 1 app — Storybook e tokens centralizados. `shared/ui/` guarda composições que dependem do app.

## Regras de Ouro

1. Layer só importa de layer abaixo (`app → pages → widgets → features → entities → shared`).
2. Slice nunca importa slice irmão. Sobe ou desce.
3. Import direto do arquivo que define o símbolo (deep import). Barrel `index` agregador proibido.
4. `@platform/api-client` só em `entities/<resource>/api/`. Exceção: `configureApiClient` no `app/`.
5. Server state = TanStack Query. Nunca duplicar em `useState`/store global.
6. Form: `useForm` + `zodResolver` com schema do `api-client` quando forma = body.
7. Mutation invalida queries via `queryKeys` da entity.
8. `entities/<resource>/ui/` é dumb: recebe entidade via prop, sem hook de API.
9. Página é fino orquestrador. Lógica complexa → widget/feature.
10. Nunca editar `generated/`. Regenere via `pnpm contract`.
11. Env via Zod no `shared/config/env.ts`. Fail-fast no boot.
12. Code splitting por página (`lazy()`).
13. Imports do `api-client` por símbolo (`/hooks/*`, `/zod/*`, `/models/*`), nunca do barrel raiz.
14. `X-Correlation-Id` injetado pelo interceptor do `api-client`; `Idempotency-Key` é do caller, por operação.
15. Lint = `eslint-plugin-import-x` (ordem, `no-cycle`, self-import) + `unused-imports` + `eslint-plugin-boundaries` (`@workspace/eslint-config/fsd`): direção de layer e slice irmão são **erro de lint**, não só convenção. Exceção declarada no config: `entities/*/api/*.keys.ts` é superfície pública cross-entity (invalidação de cache cruza domínios). No-barrel segue por convenção + review.
16. Roteador = TanStack Router; rotas em `app/router/`.
17. Wrap em entity só quando agrega (invalidation/select/transform/error). Re-export trivial.
18. `Idempotency-Key` = valor gerado pelo wrapper da feature por tentativa manual, reusado em retry de transporte.
19. `X-Correlation-Id` = ULID por aba, em `sessionStorage`, injetado em todo request.
20. Tipos de ID compartilhados moram em `shared/types/ids.ts` (branded).
21. `useForm<Input, _, Output>` quando schema tem `.transform()`/`.coerce.*`.
22. **Um form por entidade para criar + editar.** Componente único; prop opcional da entidade discrimina o modo (`user?`/`template?`: presente = edição, ausente = criação). Título, botão e mutation condicionais por modo; campo que só existe num modo fica travado (`disabled`) no outro, não duplica o componente. **Contêiner por complexidade:** form curto (poucos campos, sem etapas) → drawer (`Sheet`); form longo ou multi-step → **tela dedicada** (rota própria), nunca espremido num drawer. Referências: `UserDrawer`/`PermissionTemplateDrawer` (drawer, curtos); `GuestCreateWizard` na rota `/hotelaria/hospedes/novo` (tela dedicada, wizard de 5 etapas). A unificação create+edit vale nos dois contêineres.
23. **Enum do contrato nunca é redigitado, e tem um descritor só.** Valor de enum que existe no contrato (status, tipo, categoria) só entra na UI derivado de `@platform/api-client/models/*`: `defineEnum(constGerada, entries)` na entity dona, `z.enum(constGerada)` para schema local. Tela que precisa divergir usa `.override()`; subconjunto usa `.pick()` — **nunca** um segundo mapa em outro arquivo. Ver "Enum do contrato" abaixo. **Trava:** `apps/web/test/contract-enums.test.ts` cruza o fonte com o `openapi.json` e falha no pré-push e no CI.
24. **Campo de form = `shared/ui/form/` (`Rhf*`).** Não reescrever `register`/`Controller`+`Select`/`Checkbox`/`DatePicker` por campo em cada form; reusar/estender a biblioteca controlada (`RhfTextField`/`RhfPasswordField`/`RhfSelect`/`RhfTriStateSelect`/`RhfCheckboxField`/`RhfDateField`/`RhfTimeRangeField`). Campo controlado, sem acessar `field.ref` no render. **Data e hora nunca usam widget nativo:** `DatePicker`/`RhfDateField` para data, `TimeInput`/`RhfTimeRangeField` para hora — `<input type="date">` e `<input type="time">` são proibidos em qualquer tela (mudam de aparência e idioma por navegador/SO e ignoram os tokens).
25. **Select mostra rótulo, nunca id.** O `Select` do kit é fechado: recebe `items` (obrigatória) e desenha as opções — não há como a lista da tela divergir da que resolve o rótulo. Valor fora da lista cai no placeholder; rótulo de fallback é texto em português, jamais o identificador. Ver "Select" abaixo. **Trava:** `packages/ui/src/components/select.test.tsx` + `no-restricted-imports` de `@base-ui/react/*`, no pré-push e no CI. Ver ADR 0077.
26. **`sr-only` exige ancestral posicionado.** `sr-only` é `position: absolute`: sem `relative` (ou `absolute`/`fixed`/`sticky`) no envelope, o span resolve o bloco contido no bloco contido inicial, escapa do `overflow-y-auto` do `<main>` e infla o `scrollHeight` do documento — scrollbar de página fantasma. `isolate` **não** serve: isolação cria stacking context, não bloco contido. O `<main>` do shell carrega `relative` como backstop; o call site continua responsável pela classe. **Trava:** `platform/sr-only-requires-positioned-ancestor` em `@workspace/eslint-config/react` — erro de lint em `apps/web` e `packages/ui`, no pré-push e no CI. Ver ADR 0090.

## Anti-padrões

- `@platform/api-client/<resource>` importado fora de `entities/<resource>/api/`.
- Slice importando slice irmão.
- `entities/<resource>/ui/` chamando hook de API.
- `useState` segurando dado da API.
- Mutation sem `invalidateQueries`.
- Schema Zod reescrito quando existe em `@platform/api-client/zod/*`.
- Edição em `generated/`.
- Barrel `index.ts`/`index.tsx` agregador (re-export de slice ou segmento).
- Axios manual em componente.
- `configureApiClient` rodando em componente.
- Page gorda com lógica inline.
- Type duplicado quando existe em `@platform/api-client/models/*`.
- Server state em Zustand/Redux/Context.
- Polling manual em vez de `refetchInterval`.
- `import.meta.env.VITE_X` espalhado em vez de `shared/config/env.ts`.
- Wrap trivial em entity (`useFoo = (id) => useGetFoo(id)`) sem invalidation/select/transform.
- `refetchOnWindowFocus: false` global sem motivo documentado.
- ID de entity A importado de `entities/B/model/` (use `shared/types/ids.ts`).
- Default export em arquivo que não é página lazy-loaded.
- `useForm<Body>()` quando schema tem `.transform()` (use `useForm<Input, _, Output>`).
- React Router (`react-router-dom`) em arquivo do app — projeto usa TanStack Router.
- Par `Create<X>Drawer` + `Update<X>Drawer` (ou `*Form`/`*Dialog`) separados para a mesma entidade — unificar em um componente com prop de modo (Regra de Ouro 22).
- Wizard multi-step ou form longo dentro de um drawer (`Sheet`) — usar tela dedicada com rota própria (Regra de Ouro 22).
- `register`/`Controller` + `Select`/`Checkbox`/`DatePicker` repetidos por campo em vez de reusar `shared/ui/form/` (`Rhf*`) (Regra de Ouro 24).
- `<Input type="time">` ou `<input type="date">` — widget nativo do navegador em campo de hora/data; usar `TimeInput`/`RhfTimeRangeField` e `DatePicker`/`RhfDateField` (Regra de Ouro 24).
- Lista de opções, `z.enum([...])` ou mapa de rótulos com o valor do enum digitado à mão quando o enum existe no contrato (Regra de Ouro 23).
- `Record<string, string>` como mapa de rótulos de enum — a chave tem que ser o tipo gerado, senão não há exaustividade.
- Montar select à mão com os primitivos do Base UI em vez do `Select` fechado do kit (Regra de Ouro 25) — é erro de lint.
- Identificador como rótulo de fallback: `?? id`, `label: value`, `found.set(id, id)` — o texto de fallback é em português (Regra de Ouro 25).
- Valor financeiro em `Input` de texto livre sem `maskMoneyBrl` (via `RhfTextField mask` ou `MoneyInput`) — form guarda dígitos = centavos; parse manual de "1.800,50" é proibido.

## Onde criar X

```
Componente UI primitive?       → packages/ui (@workspace/ui)
Composição app-specific?       → shared/ui/
Componente de entidade?        → entities/<resource>/ui/
Bloco composto?                → widgets/<slice>/
Form / ação?                   → features/<action>/
Rota?                          → pages/<slice>/
Wrap de endpoint?              → entities/<resource>/api/
Hook orquestrador?             → features/<action>/model/
Util cross-feature?            → shared/lib/
Env / paths?                   → shared/config/
Provider / boot?               → app/
```

## Checklist de nova feature

```
□ Backend mudou contrato? pnpm contract; openapi.json commitado
□ Entity afetada?
  □ entities/<resource>/api/ tem wrapper do hook novo
  □ <resource>Keys atualizado
  □ Mutation tem invalidateQueries
□ Componente de entidade?       → entities/<resource>/ui/
□ Ação do usuário?              → features/<action>/
  □ ui/ tem apresentação
  □ model/ tem hook + (schema local se divergente)
  □ form usa zodResolver com schema do api-client
□ Bloco composto?               → widgets/<slice>/
□ Rota nova?                    → pages/<slice>/ + app/router/routes/ (TanStack Router: createLazyFileRoute) + path em shared/config/routes.ts
  □ Entrada em ROUTE_ACCESS + staticData.access (typecheck barra)
□ Botão/ação mutável gated por useCan (item de review)
□ Imports diretos do arquivo de origem (sem barrel)
□ Imports respeitam direção top-down
□ Nenhum import de slice irmão
□ Env nova? shared/config/env.ts (Zod)
□ Tipos via @platform/api-client/models/*
□ Loading e error states tratados
□ Lint passa (import-x + unused-imports)
```

## Performance

- `staleTime`: default 10s (curto). Lista 30–60s. Dado imutável `Infinity`.
- `select` do TanStack Query pra dado parcial sem re-render.
- Prefetch em hover de link: `queryClient.prefetchQuery({ queryKey, queryFn })`.
- `React.lazy` em `pages/`. Bundle inicial = app + shared + layout.
- `React.memo` em componentes de entidade quando lista é grande.
- Imports granulares por símbolo (`@platform/api-client/hooks/*`) → Kubb tree-shake.

## Stack (majors fixados)

**Core** — `react ^19`, `react-dom ^19`, `vite ^5`, `@vitejs/plugin-react ^4`, `typescript ^5`.
**Data** — `@tanstack/react-query ^5`, `@platform/api-client` (Kubb), `axios ^1`.
**Form** — `react-hook-form ^7`, `@hookform/resolvers ^3`, `zod ^3`.
**Router** — `@tanstack/react-router ^1`.
**State (cliente)** — `zustand ^4` (quando necessário).
**UI** — kit primitivo em `packages/ui` (`@workspace/ui`); composições app-specific em `shared/ui/`; `tailwindcss ^3`, `clsx`, `tailwind-merge`.
**Lint** — `eslint ^9`, `typescript-eslint`, `eslint-plugin-import-x`, `eslint-plugin-unused-imports`, `eslint-plugin-react`, `eslint-plugin-react-hooks`, `eslint-plugin-jsx-a11y`.

Versões majors são fixas; minor/patch atualizam via Renovate.
