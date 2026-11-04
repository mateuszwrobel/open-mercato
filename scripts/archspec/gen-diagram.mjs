#!/usr/bin/env node
// Regenerate docs/architecture/package-graph.mmd from a fresh archspec scan model.
//
//   corepack yarn archspec scan --output /tmp/archspec-model.json
//   node scripts/archspec/gen-diagram.mjs /tmp/archspec-model.json docs/architecture/package-graph.mmd
//
// Packages are grouped into layer subgraphs (from AGENTS.md intent, see
// ARCHITECTURE_AUDIT.md). Edge classes: forbidden = red thick, undeclared
// (phantom) = orange dashed, everything else default. archspec renders no
// violation colors natively (archspec#9), hence this generator.

import { readFileSync, writeFileSync } from 'node:fs'

const modelPath = process.argv[2] ?? 'archspec-model.json'
const outPath = process.argv[3] ?? 'docs/architecture/package-graph.mmd'
const model = JSON.parse(readFileSync(modelPath, 'utf8'))

const LAYER = {
  shared: 0, telemetry: 0,
  ui: 1,
  cache: 2, queue: 2, events: 2,
  search: 3, cli: 3,
  core: 4,
  documents: 5, 'ai-assistant': 5, webhooks: 5, checkout: 5, scheduler: 5, onboarding: 5, content: 5,
  'agent-gateway': 6, tillio: 6, 'storage-s3': 6,
}
const PROVIDER = /^(gateway|carrier|channel|sync|web-research)-/
const FORBIDDEN = new Set([
  'shared|cache', 'shared|core', 'shared|events', 'shared|ui',
  'ui|core', 'ui|ai-assistant', 'ui|app',
  'core|ai-assistant',
])

const shortOf = (name) => (name === 'open-mercato' ? 'repo-root' : name.replace(/^@open-mercato\//, ''))
const unitPaths = model.units
  .map((u) => [u.path.replace(/\/+$/, ''), shortOf(u.name)])
  .sort((x, y) => y[0].length - x[0].length)
const ownerOf = (file) => {
  const hit = unitPaths.find(([p]) => p !== '.' && (file === p || file.startsWith(p + '/')))
  return hit ? hit[1] : 'repo-root'
}
const isTest = (f) => /(__tests__|__integration__|\.test\.|\.spec\.)/.test(f || '')
const isTool = (f) => f.startsWith('scripts/') || f.startsWith('.ai/') || f.startsWith('packages/create-app/')

const shortByUnit = new Map(model.units.map((u) => [u.name, shortOf(u.name)]))
const declared = new Map()
for (const [key, um] of Object.entries(model.unit_manifests)) {
  const s = shortByUnit.get(key) ?? shortOf(key)
  declared.set(s, new Set((um.dependencies ?? []).map((d) => shortByUnit.get(d) ?? shortOf(d))))
}

const edges = new Map()
for (const e of model.module_edges) {
  const a = ownerOf(e.from), b = ownerOf(e.to)
  if (!a || !b || a === b) continue
  const key = `${a}|${b}`
  if (!edges.has(key)) edges.set(key, { src: 0, test: 0, tool: 0 })
  const r = edges.get(key)
  if (isTool(e.from)) r.tool++
  else if (isTest(e.from)) r.test++
  else r.src++
}
for (const [a, deps] of declared) for (const b of deps) {
  const key = `${a}|${b}`
  if (!edges.has(key)) edges.set(key, { src: 0, test: 0, tool: 0 })
}

const nodeSet = new Set(model.units.map((u) => shortOf(u.name)))
const rank = (p) => (p === 'app' ? 7 : p === 'repo-root' ? 8 : PROVIDER.test(p) ? 6 : LAYER[p] ?? 6)
const layerName = {
  0: 'L0 leaves', 1: 'L1 presentation', 2: 'L2 infrastructure', 3: 'L3 services',
  4: 'L4 platform core', 5: 'L5 product modules', 6: 'L6 providers + integrations',
  7: 'L7 composition root', 8: 'tooling (repo root)',
}

const ids = new Map()
let n = 0
const id = (p) => (ids.has(p) ? ids.get(p) : (ids.set(p, `p${++n}`), `p${++n}`))
for (const p of [...nodeSet].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) id(p)

const linkLines = []
const classified = []
for (const [key, r] of [...edges.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
  const [a, b] = key.split('|')
  if (!nodeSet.has(a) || !nodeSet.has(b)) continue
  const forbidden = FORBIDDEN.has(key)
  const phantom = !forbidden && r.src + r.test > 0 && !(declared.get(a) ?? new Set()).has(b)
  const label = forbidden ? `|${r.src + r.test}|` : ''
  linkLines.push(`  ${id(a)} -->${label} ${id(b)}`)
  classified.push(forbidden ? 'forbidden' : phantom ? 'phantom' : 'ok')
}

const lines = []
lines.push('---')
lines.push('title: open-mercato package graph — red = forbidden import, orange dashed = undeclared (phantom)')
lines.push('---')
lines.push('graph LR')

const byRank = new Map()
for (const p of [...nodeSet].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
  const r = rank(p)
  if (!byRank.has(r)) byRank.set(r, [])
  byRank.get(r).push(p)
}
for (const r of [...byRank.keys()].sort((a, b) => a - b)) {
  lines.push(`  subgraph g${r}["${layerName[r]}"]`)
  for (const p of byRank.get(r)) lines.push(`    ${id(p)}["${p}"]`)
  lines.push('  end')
}
lines.push(...linkLines)

for (const cls of ['forbidden', 'phantom']) {
  const idxs = classified.map((c, i) => (c === cls ? i : -1)).filter((i) => i >= 0)
  if (!idxs.length) continue
  const style = cls === 'forbidden' ? 'stroke:#e53935,stroke-width:3px' : 'stroke:#fb8c00,stroke-width:2px,stroke-dasharray:6 4'
  lines.push(`  linkStyle ${idxs.join(' ')} ${style};`)
}
lines.push(`  %% forbidden: ${classified.filter((c) => c === 'forbidden').length} pairs, phantom: ${classified.filter((c) => c === 'phantom').length}, allowed: ${classified.filter((c) => c === 'ok').length}`)

writeFileSync(outPath, lines.join('\n') + '\n')
console.log(`wrote ${outPath} — ${ids.size} nodes, ${classified.length} links (${classified.filter((c) => c === 'forbidden').length} forbidden, ${classified.filter((c) => c === 'phantom').length} phantom)`)
