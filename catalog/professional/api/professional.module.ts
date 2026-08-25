import { Module } from "@nestjs/common"

/**
 * Módulo da entrada `professional`: o recorte profissional/agenda extraído do
 * `identity` no corte do agregado (AD-035). Nasce vazio no esqueleto e recebe
 * portas, repositórios e facades nas tasks seguintes.
 *
 * A aresta com o `identity` é carregada só por `dependsOn` — nenhum token sobe
 * para `shared/kernel/**` porque o corte no agregado desfaz o ciclo (AD-025,
 * AD-021/AD-024, RULE C).
 */
@Module({})
export class ProfessionalModule {}
