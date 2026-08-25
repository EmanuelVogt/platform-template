/**
 * As violações semeadas de cada ban. Vivem num `.fixture.ts` porque o scanner
 * varre `apps/api/src/**`: escritas dentro do próprio spec, elas seriam
 * contadas como violações reais da árvore — a mesma razão do allow-list de
 * `*.fixture.ts` em `module-boundaries.spec.ts`.
 */
export const SEEDED = {
  testingModule: "const module = await Test.createTestingModule({}).compile()",
  seedUserDefinition: "async function seedUser(pool) {}",
  waitForDefinition: "const waitFor = () => {}",
  waitForImport: 'import { seedUser } from "../testing"',
  waitForCall: "await harness.waitFor(() => x)",
  pngLiteral: 'const png = "iVBORw0KGgoAAAA"',
  passwordLiteral: 'password: "Senha-Forte-2026!",',
  passwordConstant: 'const PASSWORD = "x"',
  passwordHash: 'passwordHash: "argon2",',
  webOrigin: 'const origin = "http://localhost:5173"',
  poolInsideTest: 'it("t", async () => {\n  const pool = createTestPool()\n})',
  poolInBeforeAll: "beforeAll(async () => {\n  pool = createTestPool()\n})",
  anyRecord: "const deps: Record<string, any> = {}",
  unknownRecord: "const deps: Record<string, unknown> = {}",
  unknownCast: "const repo = {} as unknown as Repo",
  neverCast: "const nope = value as never",
  typedMock: "const repo = mockOf<Repo>()",
  fromProps: "const sample = Sample.fromProps({ id })",
  fromPropsInBarrel: "return Sample.fromProps({ id })",
  makeEntity: "const sample = makeSample({ id })",
  genericContainer: "const container = new GenericContainer('postgres')",
  sleepAsProof: "await new Promise((resolve) => setTimeout(resolve, 25))",
  handRolledPoll: "while (!(await condition())) {",
  forPoll: "for (let tries = 0; !(await ready()); tries += 1) {",
  awaitedIteration: "for (const row of await pool.query(SELECT)) {",
} as const
