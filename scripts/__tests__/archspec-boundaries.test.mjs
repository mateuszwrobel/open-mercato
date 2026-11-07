import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const archspecBin = path.join(repositoryRoot, 'node_modules', '.bin', 'archspec')

// archspec adjudicates the SOURCE graph: when package dist output exists,
// deep subpath imports legitimately resolve into the built files, which are
// excluded build territory, and every such import fails loud by design
// ('resolves only into excluded path dist'). Likewise, generated gitignored
// targets that exist on disk after 'yarn generate' are invisible to the file
// index and abort as unresolvable, while absent ones are report-only. The
// guard therefore only adjudicates unbuilt checkouts; CI runs it as an
// explicit step before build artifacts are downloaded.
const artifactPresent = () => {
  for (const parent of ['packages', 'apps']) {
    const dir = path.join(repositoryRoot, parent)
    if (!fs.existsSync(dir)) continue
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && fs.existsSync(path.join(dir, entry.name, 'dist'))) return `${parent}/${entry.name}/dist`
    }
  }
  const generated = path.join(repositoryRoot, 'packages', 'core', 'generated')
  if (fs.existsSync(generated)) return 'packages/core/generated'
  return null
}

// Architecture guard: archspec extracts the real import graph from the tree
// and adjudicates it against architecture.spec.toml. A failing run lists the
// offending pairs as "disallowed cross-component dependency" (imports that
// cross a boundary the spec forbids) or "missing edge" (imports whose target
// is absent from the importing package.json — phantom dependencies that only
// resolve through the hoisted node_modules layout).
test('architecture spec matches the real import graph', (t) => {
  assert.ok(fs.existsSync(archspecBin), 'archspec binary missing - run yarn install')

  const artifact = artifactPresent()
  if (artifact) {
    t.skip(`built/generated output present (${artifact}) - archspec verify adjudicates unbuilt sources; run after a fresh checkout, or remove packages/*/dist and packages/core/generated (never 'yarn clean:generated' - it deletes committed generated files)`)
    return
  }

  let status = 0
  let output = ''
  try {
    output = execFileSync(archspecBin, ['verify'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    })
  } catch (error) {
    status = error.status ?? -1
    output = `${error.stdout ?? ''}${error.stderr ?? ''}`
  }

  const verdicts = output
    .split('\n')
    .filter((line) => /missing edge|disallowed cross-component|cycle|does not match/.test(line))
    .slice(0, 80)

  assert.equal(status, 0, `archspec verify failed (exit ${status}):\n${verdicts.join('\n') || output.slice(0, 8000)}`)
})
