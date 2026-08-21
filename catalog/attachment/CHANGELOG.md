# Changelog — `attachment`

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).

## [1.0.0]

### Adicionado

- Entrada inicial do catálogo, extraída de `apps/api/src/modules/attachment/**`: upload,
  download e log de acesso de anexos, com os perfis genéricos `avatar`, `access-link-avatar`,
  `document`, `image` e `multi` (AD-010).
- `api/domain/upload/**` — perfis de upload de produto dobrados para dentro da entrada
  (antes no kernel, em `kernel/upload/**`, que permanece lá apenas para módulos que não os
  usam mais).
- Testes de paridade (`parity/*.parity.spec.ts` + `contract.snapshot.json`) cobrindo o contrato
  HTTP (`uploadAttachments`, `downloadAttachment`), as regras dos perfis de upload e o contrato
  de `AttachmentFacade.listAccessLog`.

### Alterado

- Passa a implementar (bind) a porta `PROFILE_IMAGE_STORE`/`ProfileImageStore` do kernel para o
  avatar de perfil do `identity`, invertendo a dependência direta que a entrada tinha em
  `AttachmentFacade` (AD-024, T17c).
