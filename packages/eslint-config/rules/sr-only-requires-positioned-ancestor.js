/**
 * `sr-only` do Tailwind v4 é `position: absolute`. Sem ancestral posicionado o
 * bloco contido do elemento vira o bloco contido inicial: ele escapa do
 * contêiner com `overflow-y-auto` e infla o `scrollHeight` do documento
 * (produção: 3069px de documento contra 806px de viewport, scrollbar fantasma).
 * `isolate` não resolve — isolação de stacking context não estabelece bloco
 * contido para `position: absolute`. Ver docs/adr/0090.
 */

const POSITIONING_CLASSES = new Set(["relative", "absolute", "fixed", "sticky"])
const CLASS_BUILDERS = new Set(["cn", "clsx", "cx", "twMerge", "twJoin"])

function addTokens(target, text) {
  for (const token of text.split(/\s+/)) {
    if (token) {
      target.add(token.replace(/^!/, "").replace(/!$/, ""))
    }
  }
}

/**
 * Lê os tokens estáticos de uma expressão de className. `false` significa "há
 * parte dinâmica ilegível" — a regra então se cala, porque a classe que falta
 * pode estar exatamente ali.
 */
function readExpression(node, tokens) {
  if (!node) {
    return false
  }

  switch (node.type) {
    case "Literal":
      if (typeof node.value !== "string") {
        return false
      }
      addTokens(tokens, node.value)
      return true

    case "TemplateLiteral":
      if (node.expressions.length > 0) {
        return false
      }
      addTokens(tokens, node.quasis.map((quasi) => quasi.value.cooked).join(" "))
      return true

    // Ramo condicional entra inteiro: se qualquer um posiciona, não acusamos.
    case "ConditionalExpression":
      return (
        readExpression(node.consequent, tokens) &&
        readExpression(node.alternate, tokens)
      )

    case "LogicalExpression":
      return readExpression(node.right, tokens)

    case "CallExpression":
      if (
        node.callee.type !== "Identifier" ||
        !CLASS_BUILDERS.has(node.callee.name)
      ) {
        return false
      }
      return node.arguments.every((argument) => readExpression(argument, tokens))

    case "JSXExpressionContainer":
      return readExpression(node.expression, tokens)

    default:
      return false
  }
}

/** `null` quando o elemento tem spread ou className ilegível. */
function readClassNames(openingElement) {
  const tokens = new Set()

  for (const attribute of openingElement.attributes) {
    if (attribute.type === "JSXSpreadAttribute") {
      return null
    }
    if (attribute.name.name !== "className") {
      continue
    }
    if (!readExpression(attribute.value, tokens)) {
      return null
    }
  }

  return tokens
}

function hasSrOnly(tokens) {
  for (const token of tokens) {
    if (token === "sr-only" || token.endsWith(":sr-only")) {
      return true
    }
  }
  return false
}

function isPositioned(tokens) {
  for (const token of tokens) {
    if (POSITIONING_CLASSES.has(token)) {
      return true
    }
  }
  return false
}

/** Só elemento DOM: componente não revela aqui a classe da própria raiz. */
function isHostElement(openingElement) {
  const name = openingElement.name
  return name.type === "JSXIdentifier" && /^[a-z]/.test(name.name)
}

/**
 * Elemento entregue como valor de prop (`icon={<span/>}`) não tem pai visível no
 * arquivo — parar na `JSXAttribute` evita acusar o dono errado.
 */
function findEnclosingElement(ancestors) {
  for (let index = ancestors.length - 2; index >= 0; index -= 1) {
    const ancestor = ancestors[index]
    if (ancestor.type === "JSXAttribute") {
      return null
    }
    if (ancestor.type === "JSXElement") {
      return ancestor.openingElement
    }
  }
  return null
}

export const srOnlyRequiresPositionedAncestor = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Exige ancestral posicionado para elemento com `sr-only` (docs/adr/0090)",
    },
    schema: [],
    messages: {
      unpositionedAncestor:
        "`sr-only` é `position: absolute`: sem ancestral posicionado ele escapa do contêiner com scroll e infla a altura do documento (scrollbar fantasma). Adicione `relative` ao `<{{parent}}>` que envolve este elemento. Ver docs/adr/0090-sr-only-exige-ancestral-posicionado.md",
    },
  },

  create(context) {
    return {
      JSXOpeningElement(node) {
        const ownClasses = readClassNames(node)
        if (!ownClasses || !hasSrOnly(ownClasses)) {
          return
        }

        const parent = findEnclosingElement(context.sourceCode.getAncestors(node))
        if (!parent || !isHostElement(parent)) {
          return
        }

        const parentClasses = readClassNames(parent)
        if (parentClasses === null || isPositioned(parentClasses)) {
          return
        }

        context.report({
          node,
          messageId: "unpositionedAncestor",
          data: { parent: parent.name.name },
        })
      },
    }
  },
}

export default srOnlyRequiresPositionedAncestor
