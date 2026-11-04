import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const archspecBin = path.join(repositoryRoot, 'node_modules', '.bin', 'archspec')

// Architecture guard: archspec extracts the real import graph from the tree
// and adjudicates it against architecture.spec.toml. A failing run lists the
// offending pairs as "disallowed cross-component dependency" (imports that
// cross a boundary the spec forbids) or "missing edge" (imports whose target
// is absent from the importing package.json — phantom dependencies that only
// resolve through the hoisted node_modules layout).
test('architecture spec matches the real import graph', () => {
  assert.ok(fs.existsSync(archspecBin), 'archspec binary missing - run yarn install')

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
