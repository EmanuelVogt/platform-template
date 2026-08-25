// Plumbing legado: as entradas do catálogo ainda importam daqui. A
// implementação é uma só — o harness — e este arquivo some quando o último
// import de `catalog/**` apontar para `src/shared/test/int/logger`.
export { makeTestLogger } from "../../src/shared/test/int/logger"
