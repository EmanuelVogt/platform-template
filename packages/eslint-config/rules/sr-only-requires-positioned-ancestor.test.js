import { describe, it } from "node:test"

import { RuleTester } from "eslint"

import { srOnlyRequiresPositionedAncestor } from "./sr-only-requires-positioned-ancestor.js"

RuleTester.describe = describe
RuleTester.it = it

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
})

const unpositionedAncestor = [{ messageId: "unpositionedAncestor" }]

ruleTester.run(
  "sr-only-requires-positioned-ancestor",
  srOnlyRequiresPositionedAncestor,
  {
    valid: [
      // Ancestral posicionado — a forma correta do bug.
      `<span className="relative inline-flex rounded-full ring-2 ring-primary"><span className="sr-only">Ativo</span></span>`,
      `<figure className="relative"><figcaption className="sr-only">Foto</figcaption></figure>`,
      `<div className={cn("absolute", "inset-0")}><span className="sr-only">x</span></div>`,
      `<div className={cn("flex", isOpen && "sticky")}><span className="sr-only">x</span></div>`,
      // className do ancestral é ilegível: nada a afirmar.
      `<div className={styles.wrapper}><span className="sr-only">x</span></div>`,
      `<div className={cn("flex", extra)}><span className="sr-only">x</span></div>`,
      `<div className={\`flex \${extra}\`}><span className="sr-only">x</span></div>`,
      `<div {...props}><span className="sr-only">x</span></div>`,
      // className do próprio elemento é ilegível.
      `<div className="flex"><span className={maybeSrOnly}>x</span></div>`,
      // Componente não revela a classe da própria raiz.
      `<Badge className="gap-2"><span className="sr-only">x</span></Badge>`,
      // Sem pai no arquivo, e pai só via prop.
      `<span className="sr-only">x</span>`,
      `<Tooltip icon={<span className="sr-only">x</span>} />`,
      // `not-sr-only` não é `sr-only`.
      `<div className="flex"><span className="focus:not-sr-only">x</span></div>`,
    ],
    invalid: [
      {
        code: `<span className="inline-flex rounded-full ring-2 ring-primary"><span className="sr-only">Ativo</span></span>`,
        errors: unpositionedAncestor,
      },
      {
        code: `<figure className="mt-4 overflow-hidden"><figcaption className="sr-only">Foto do quarto</figcaption></figure>`,
        errors: unpositionedAncestor,
      },
      {
        code: `<figure><figcaption className="sr-only">Foto do quarto</figcaption></figure>`,
        errors: unpositionedAncestor,
      },
      {
        code: `<div className="isolate flex"><span className="sr-only">x</span></div>`,
        errors: unpositionedAncestor,
      },
      {
        code: `<li className={cn("flex", "items-center")}><span className={cn("sr-only")}>x</span></li>`,
        errors: unpositionedAncestor,
      },
      {
        code: `<div className="md:relative"><span className="sr-only">x</span></div>`,
        errors: unpositionedAncestor,
      },
      {
        code: `<ul className="flex">{items.map((item) => (<li className="flex"><span className="sr-only">{item}</span></li>))}</ul>`,
        errors: unpositionedAncestor,
      },
    ],
  },
)
