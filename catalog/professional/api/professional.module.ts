import { Module } from "@nestjs/common"

import { ProfessionalAssignmentFacade } from "./api/facades/professional-assignment.facade"
import { ProfessionalDirectoryFacade } from "./api/facades/professional-directory.facade"
import { PROFESSIONAL_ASSIGNMENT_REPOSITORY } from "./domain/ports/professional-assignment.repository"
import { PROFESSIONAL_COMMITMENTS } from "./domain/ports/professional-commitments.port"
import { PROFESSIONAL_DIRECTORY_READER } from "./domain/ports/professional-directory.reader"
import { PROFESSIONAL_SCOPE } from "./domain/ports/professional-scope.port"
import { DrizzleProfessionalAssignmentRepository } from "./infrastructure/repositories/drizzle-professional-assignment.repository"
import { DrizzleProfessionalDirectoryReader } from "./infrastructure/repositories/drizzle-professional-directory.reader"
import {
  NullProfessionalCommitments,
  NullProfessionalScope,
} from "./infrastructure/repositories/null-professional-adapters"

import type { ProfessionalCommitments } from "./domain/ports/professional-commitments.port"
import type { ProfessionalScope } from "./domain/ports/professional-scope.port"
import type { DynamicModule, Provider, Type } from "@nestjs/common"

const PORTS: Provider[] = [
  {
    provide: PROFESSIONAL_ASSIGNMENT_REPOSITORY,
    useClass: DrizzleProfessionalAssignmentRepository,
  },
  {
    provide: PROFESSIONAL_DIRECTORY_READER,
    useClass: DrizzleProfessionalDirectoryReader,
  },
]

const FACADES = [ProfessionalAssignmentFacade, ProfessionalDirectoryFacade]

/**
 * Slot de produto: a entrada não conhece o catálogo de áreas/serviços nem a
 * agenda, então quem sabe validar escopo e ler compromissos entra pela raiz de
 * composição do filho. Ausente → null objects.
 */
export interface ProfessionalProductSlot {
  module: Type<unknown>
  scope: Type<ProfessionalScope>
  commitments: Type<ProfessionalCommitments>
}

/**
 * Módulo da entrada `professional`: o recorte profissional/agenda extraído do
 * `identity` no corte do agregado (AD-035).
 *
 * A aresta com o `identity` é carregada só por `dependsOn` — nenhum token sobe
 * para `shared/kernel/**` porque o corte no agregado desfaz o ciclo (AD-025,
 * AD-021/AD-024, RULE C). A entrada não importa nenhuma outra entrada.
 *
 * SharedKernelModule é @Global — não reimportar Transactional/Context aqui.
 */
@Module({})
export class ProfessionalModule {
  static forRoot(
    options: { product?: ProfessionalProductSlot } = {}
  ): DynamicModule {
    const { product } = options
    const slot: Provider[] = product
      ? [
          { provide: PROFESSIONAL_SCOPE, useExisting: product.scope },
          {
            provide: PROFESSIONAL_COMMITMENTS,
            useExisting: product.commitments,
          },
        ]
      : [
          { provide: PROFESSIONAL_SCOPE, useClass: NullProfessionalScope },
          {
            provide: PROFESSIONAL_COMMITMENTS,
            useClass: NullProfessionalCommitments,
          },
        ]

    return {
      module: ProfessionalModule,
      // Global porque o módulo é dinâmico: quem importar `ProfessionalModule`
      // pelo nome da classe receberia outra instância, vazia, e não acharia as
      // facades — mesma armadilha documentada em `identity.module.ts`.
      global: true,
      imports: product ? [product.module] : [],
      providers: [...PORTS, ...slot, ...FACADES],
      exports: [...FACADES, PROFESSIONAL_SCOPE, PROFESSIONAL_COMMITMENTS],
    }
  }
}
