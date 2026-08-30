/**
 * Lição L-007: um teste cujo corpo só afirma existência (`toBeDefined`,
 * `toBeTruthy`, `not.toThrow()`) continua verde sob a implementação errada —
 * ele prova que algo aconteceu, não *o que* aconteceu. A regra reprova o corpo
 * inteiro, não a asserção isolada: uma checagem de existência antes de uma
 * asserção de valor é legítima. Ver .agents/skills/testing/SKILL.md.
 *
 * `not.toThrow(<matcher>)` conta como existência junto da forma sem argumento —
 * não é isenção. No Vitest ele afirma só "não lançou *este* tipo": passa quando
 * o código lança um erro diferente. É mais fraco que `not.toThrow()`, que
 * reprova qualquer lançamento.
 */

const TEST_NAMES = new Set(["it", "test"])

const EXISTENCE_MATCHERS = new Set([
  "toBeDefined",
  "toBeUndefined",
  "toBeTruthy",
  "toBeFalsy",
])

function rootName(node) {
  let current = node
  for (;;) {
    switch (current.type) {
      case "MemberExpression":
        current = current.object
        break
      case "CallExpression":
        current = current.callee
        break
      case "TaggedTemplateExpression":
        current = current.tag
        break
      case "Identifier":
        return current.name
      default:
        return null
    }
  }
}

function testCallback(node) {
  return node.arguments.find(
    (argument) =>
      argument.type === "ArrowFunctionExpression" ||
      argument.type === "FunctionExpression"
  )
}

function isExpectAssertions(node) {
  return (
    node.callee.type === "MemberExpression" &&
    node.callee.object.type === "Identifier" &&
    node.callee.object.name === "expect" &&
    node.callee.property.type === "Identifier" &&
    node.callee.property.name === "assertions"
  )
}

function isExpectCall(node) {
  return node.callee.type === "Identifier" && node.callee.name === "expect"
}

/**
 * Sobe do `expect(...)` até a chamada do matcher, devolvendo o nome do matcher,
 * os modificadores atravessados (`not`, `resolves`, `rejects`) e a chamada.
 * `null` quando não há matcher — `vitest/valid-expect` já cobre esse caso.
 */
function assertionOf(expectCall) {
  const modifiers = []
  let current = expectCall

  while (
    current.parent?.type === "MemberExpression" &&
    current.parent.object === current
  ) {
    const member = current.parent
    const name =
      member.property.type === "Identifier" ? member.property.name : null

    if (
      member.parent?.type === "CallExpression" &&
      member.parent.callee === member
    ) {
      return { matcher: name, modifiers, call: member.parent }
    }

    if (name === null) {
      return null
    }
    modifiers.push(name)
    current = member
  }

  return null
}

function isExistenceOnly(assertion) {
  if (assertion.matcher === null) {
    return false
  }

  if (EXISTENCE_MATCHERS.has(assertion.matcher)) {
    return true
  }

  return assertion.matcher === "toThrow" && assertion.modifiers.includes("not")
}

export const noExistenceOnlyAssert = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Exige que um teste afirme um valor concreto, não apenas existência (L-007)",
    },
    schema: [],
    messages: {
      existenceOnly:
        "Este teste só afirma existência ({{matchers}}): ele passa sob uma implementação errada. Afirme o valor concreto — a linha gravada, o corpo do problema, o alvo do redirect. `not.toThrow(<matcher>)` não resolve: ele passa quando o código lança outro erro — use `not.toThrow()` sem argumento junto de uma asserção sobre o valor produzido. Se a existência é mesmo tudo que se pode afirmar, declare `expect.assertions(n)`.",
    },
  },

  create(context) {
    const frames = []

    function report(frame) {
      if (frame.exempt || frame.assertions.length === 0) {
        return
      }
      if (!frame.assertions.every(isExistenceOnly)) {
        return
      }

      const matchers = [
        ...new Set(
          frame.assertions.map((assertion) =>
            assertion.matcher === "toThrow"
              ? assertion.call.arguments.length === 0
                ? "not.toThrow()"
                : "not.toThrow(<matcher>)"
              : `${assertion.matcher}()`
          )
        ),
      ].join(", ")

      context.report({
        node: frame.node.callee,
        messageId: "existenceOnly",
        data: { matchers },
      })
    }

    return {
      CallExpression(node) {
        if (TEST_NAMES.has(rootName(node.callee)) && testCallback(node)) {
          frames.push({ node, exempt: false, assertions: [] })
          return
        }

        const frame = frames.at(-1)
        if (!frame) {
          return
        }

        if (isExpectAssertions(node)) {
          frame.exempt = true
          return
        }

        if (isExpectCall(node)) {
          const assertion = assertionOf(node)
          if (assertion) {
            frame.assertions.push(assertion)
          }
        }
      },

      "CallExpression:exit"(node) {
        if (frames.at(-1)?.node === node) {
          report(frames.pop())
        }
      },
    }
  },
}

export default noExistenceOnlyAssert
