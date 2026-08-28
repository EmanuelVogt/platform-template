import test from "node:test"
import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  entryTagName,
  entryTagSlug,
  entryTagsFromLsRemote,
  lintEntryBump,
  lintEntryTagCoverage,
} from "../lib/lint.mjs"

const KERNEL_TAG = "v2.0.0"

function refs(tags) {
  return tags.map((tag) => `abc123\trefs/tags/${tag}\n`).join("")
}

function fakeGit({
  kernelTags = [KERNEL_TAG],
  entryTags = [],
  changed = () => true,
  manifests = {},
  ancestor = () => true,
} = {}) {
  return (command, args) => {
    assert.equal(command, "git")
    const [sub] = args
    if (sub === "ls-remote") {
      const pattern = args.at(-1)
      return {
        status: 0,
        stdout: refs(pattern === "v*" ? kernelTags : entryTags),
      }
    }
    if (sub === "diff") {
      return { status: changed(args.at(-1)) ? 1 : 0, stdout: "" }
    }
    if (sub === "show") {
      const [ref] = args[1].split(":")
      const manifest = manifests[ref === "" ? "INDEX" : ref]
      return manifest === undefined
        ? { status: 128, stdout: "" }
        : { status: 0, stdout: JSON.stringify(manifest) }
    }
    if (sub === "merge-base") {
      return { status: ancestor(args[2], args[3]) ? 0 : 1, stdout: "" }
    }
    throw new Error(`subcomando git inesperado no teste: ${sub}`)
  }
}

function withEntry(manifest, run, dirName = "widget") {
  const repoRoot = mkdtempSync(path.join(tmpdir(), "entry-tag-"))
  const entryDir = path.join(repoRoot, "catalog", dirName)
  try {
    mkdirSync(entryDir, { recursive: true })
    writeFileSync(path.join(entryDir, "module.json"), JSON.stringify(manifest))
    run({ repoRoot, entryDir })
  } finally {
    rmSync(repoRoot, { recursive: true, force: true })
  }
}

const WIDGET = { name: "widget", version: "1.0.0", kernelRange: "^2.0.0" }
const IDENTITY = {
  name: "identity",
  variant: "single-tenant",
  version: "3.0.0",
  kernelRange: "^2.0.0",
}

test("entryTagSlug junta name e variant quando o manifest declara variant", () => {
  assert.equal(entryTagSlug(IDENTITY), "identity-single-tenant")
})

test("entryTagSlug usa o nome puro quando o manifest não declara variant", () => {
  assert.equal(entryTagSlug(WIDGET), "widget")
})

test("entryTagName de uma entrada com variant nunca produz a ref de nome puro", () => {
  const name = entryTagName({ ...IDENTITY, version: "3.0.0" })
  assert.equal(name, "catalog/identity-single-tenant@3.0.0")
  assert.notEqual(name, "catalog/identity@3.0.0")
})

test("entryTagsFromLsRemote trata nome puro e nome com variant como slugs distintos", () => {
  const bySlug = entryTagsFromLsRemote(
    refs([
      "catalog/identity@3.0.0",
      "catalog/identity-single-tenant@3.0.0",
      "v3.0.1",
    ])
  )
  assert.deepEqual(bySlug.get("identity"), ["3.0.0"])
  assert.deepEqual(bySlug.get("identity-single-tenant"), ["3.0.0"])
})

test("entryTagsFromLsRemote ordena por semver e descarta versão inválida", () => {
  const bySlug = entryTagsFromLsRemote(
    refs([
      "catalog/widget@1.10.0",
      "catalog/widget@1.2.0",
      "catalog/widget@latest",
    ])
  )
  assert.deepEqual(bySlug.get("widget"), ["1.2.0", "1.10.0"])
})

test("lintEntryBump compara a entrada com a tag da própria entrada, não com a do kernel", () => {
  withEntry(WIDGET, ({ repoRoot, entryDir }) => {
    const errors = lintEntryBump({
      repoRoot,
      exec: fakeGit({
        entryTags: ["catalog/widget@1.0.0"],
        manifests: { "catalog/widget@1.0.0": WIDGET, HEAD: WIDGET },
      }),
      entries: [entryDir],
    })
    assert.equal(errors.length, 1)
    assert.match(errors[0], /mudou desde catalog\/widget@1\.0\.0 sem bump/)
    assert.doesNotMatch(errors[0], /v2\.0\.0/)
  })
})

test("lintEntryBump não reclama de entrada idêntica à árvore da própria tag", () => {
  withEntry(WIDGET, ({ repoRoot, entryDir }) => {
    const errors = lintEntryBump({
      repoRoot,
      exec: fakeGit({
        entryTags: ["catalog/widget@1.0.0"],
        changed: () => false,
      }),
      entries: [entryDir],
    })
    assert.deepEqual(errors, [])
  })
})

test("lintEntryBump cai na tag do kernel para entrada que nunca foi tagueada", () => {
  withEntry(WIDGET, ({ repoRoot, entryDir }) => {
    const errors = lintEntryBump({
      repoRoot,
      exec: fakeGit({
        entryTags: [],
        manifests: { [KERNEL_TAG]: WIDGET, HEAD: WIDGET },
      }),
      entries: [entryDir],
    })
    assert.equal(errors.length, 1)
    assert.match(errors[0], /mudou desde v2\.0\.0 sem bump/)
  })
})

test("lintEntryBump aceita versão à frente da última tag da entrada — o corte é posterior e manual", () => {
  withEntry({ ...WIDGET, version: "1.1.0" }, ({ repoRoot, entryDir }) => {
    const errors = lintEntryBump({
      repoRoot,
      exec: fakeGit({ entryTags: ["catalog/widget@1.0.0"] }),
      entries: [entryDir],
    })
    assert.deepEqual(errors, [])
  })
})

test("lintEntryBump acusa versão sem tag e anterior à última tag da entrada", () => {
  withEntry({ ...WIDGET, version: "0.9.0" }, ({ repoRoot, entryDir }) => {
    const errors = lintEntryBump({
      repoRoot,
      exec: fakeGit({ entryTags: ["catalog/widget@1.0.0"] }),
      entries: [entryDir],
    })
    assert.equal(errors.length, 1)
    assert.match(errors[0], /versão 0\.9\.0 não corresponde a nenhuma tag/)
    assert.match(errors[0], /catalog\/widget@1\.0\.0/)
  })
})

test("lintEntryBump não aceita a tag de nome puro como linha de base de uma entrada com variant", () => {
  withEntry(
    IDENTITY,
    ({ repoRoot, entryDir }) => {
      const errors = lintEntryBump({
        repoRoot,
        exec: fakeGit({
          entryTags: ["catalog/identity@3.0.0"],
          manifests: { [KERNEL_TAG]: IDENTITY, HEAD: IDENTITY },
        }),
        entries: [entryDir],
      })
      assert.equal(errors.length, 1)
      assert.match(errors[0], /mudou desde v2\.0\.0 sem bump/)
      assert.doesNotMatch(errors[0], /catalog\/identity@3\.0\.0/)
    },
    "identity/single-tenant"
  )
})

test("lintEntryTagCoverage exige uma tag para a versão que a tag do kernel lançou", () => {
  withEntry(WIDGET, ({ repoRoot, entryDir }) => {
    const errors = lintEntryTagCoverage({
      repoRoot,
      exec: fakeGit({ entryTags: [], manifests: { [KERNEL_TAG]: WIDGET } }),
      entries: [entryDir],
    })
    assert.equal(errors.length, 1)
    assert.match(errors[0], /versão 1\.0\.0 está no catálogo de v2\.0\.0/)
    assert.match(errors[0], /"catalog\/widget@1\.0\.0" não existe/)
  })
})

test("lintEntryTagCoverage exige o segmento de variant na tag que cobra", () => {
  withEntry(
    IDENTITY,
    ({ repoRoot, entryDir }) => {
      const errors = lintEntryTagCoverage({
        repoRoot,
        exec: fakeGit({
          entryTags: ["catalog/identity@3.0.0"],
          manifests: { [KERNEL_TAG]: IDENTITY },
        }),
        entries: [entryDir],
      })
      assert.equal(errors.length, 1)
      assert.match(errors[0], /"catalog\/identity-single-tenant@3\.0\.0"/)
    },
    "identity/single-tenant"
  )
})

test("lintEntryTagCoverage aceita a entrada cuja tag existe e é alcançável a partir da tag do kernel", () => {
  withEntry(WIDGET, ({ repoRoot, entryDir }) => {
    const errors = lintEntryTagCoverage({
      repoRoot,
      exec: fakeGit({
        entryTags: ["catalog/widget@1.0.0"],
        manifests: { [KERNEL_TAG]: WIDGET },
      }),
      entries: [entryDir],
    })
    assert.deepEqual(errors, [])
  })
})

test("lintEntryTagCoverage acusa tag de entrada que não ancora no commit do kernel que lançou a versão", () => {
  withEntry(WIDGET, ({ repoRoot, entryDir }) => {
    const errors = lintEntryTagCoverage({
      repoRoot,
      exec: fakeGit({
        entryTags: ["catalog/widget@1.0.0"],
        manifests: { [KERNEL_TAG]: WIDGET },
        ancestor: () => false,
      }),
      entries: [entryDir],
    })
    assert.equal(errors.length, 1)
    assert.match(errors[0], /não é alcançável a partir de v2\.0\.0/)
  })
})

test("lintEntryTagCoverage ignora entrada que ainda não existia na tag do kernel", () => {
  withEntry(WIDGET, ({ repoRoot, entryDir }) => {
    const errors = lintEntryTagCoverage({
      repoRoot,
      exec: fakeGit({ entryTags: [], manifests: {} }),
      entries: [entryDir],
    })
    assert.deepEqual(errors, [])
  })
})

test("lintEntryTagCoverage mede a versão lançada, não a de HEAD — um bump em curso não cobra tag", () => {
  withEntry({ ...WIDGET, version: "1.1.0" }, ({ repoRoot, entryDir }) => {
    const errors = lintEntryTagCoverage({
      repoRoot,
      exec: fakeGit({
        entryTags: ["catalog/widget@1.0.0"],
        manifests: { [KERNEL_TAG]: WIDGET },
      }),
      entries: [entryDir],
    })
    assert.deepEqual(errors, [])
  })
})
