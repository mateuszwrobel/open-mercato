#!/usr/bin/env node
// Regenerate architecture.spec.toml from a fresh archspec scan model.
//
//   corepack yarn archspec scan --output /tmp/archspec-model.json
//   node scripts/archspec/gen-intended-spec.mjs /tmp/archspec-model.json
//
// The spec declares one module per workspace plus a repo-root module.
// depend_on = manifest edges ∪ source import edges, minus FORBIDDEN pairs
// (the boundaries under remediation) — so a red `archspec verify` always
// points at a real finding: disallowed = forbidden import still present,
// missing edge = import whose dependency declaration is absent.
// See ARCHITECTURE_AUDIT.md for the findings this spec encodes.

import { readFileSync, writeFileSync } from 'node:fs'

const modelPath = process.argv[2] ?? 'archspec-model.json'
const model = JSON.parse(readFileSync(modelPath, 'utf8'))

// Boundaries the architecture must not allow. Each entry is evidence-backed in
// ARCHITECTURE_AUDIT.md (forbidden-import table with import-site counts).
const FORBIDDEN = new Set([
  'shared|cache', 'shared|core', 'shared|events', 'shared|ui',
  'ui|core', 'ui|ai-assistant', 'ui|app',
  'core|ai-assistant',
])

// Bare-specifier imports from repo-root tooling that verify resolves through
// hoisted workspace links; they appear in verify verdicts but not in model
// module_edges (archspec#7), so they are pinned here. To rediscover: run
// verify with this spec and grep `disallowed cross-component dependency: repo-root ->`.
const ROOT_HOISTED = [
  'ai-assistant', 'app', 'carrier-inpost', 'channel-apns', 'channel-discord',
  'channel-expo', 'channel-fcm', 'channel-gmail', 'channel-imap', 'checkout',
  'core', 'documents', 'gateway-stripe', 'onboarding', 'search', 'sync-akeneo',
  'telemetry', 'tillio', 'ui', 'webhooks',
]

const shortOf = (name) => (name === 'open-mercato' ? 'repo-root' : name.replace(/^@open-mercato\//, ''))
const shortByUnit = new Map(model.units.map((u) => [u.name, shortOf(u.name)]))
const allShorts = new Set(model.units.map((u) => shortOf(u.name)))

const dep = new Map()
for (const [key, um] of Object.entries(model.unit_manifests)) {
  const short = shortByUnit.get(key) ?? shortOf(key)
  dep.set(short, new Set((um.dependencies ?? []).map((d) => shortByUnit.get(d) ?? shortOf(d))))
}

const unitPaths = model.units
  .map((u) => [u.path.replace(/\/+$/, ''), shortOf(u.name)])
  .sort((x, y) => y[0].length - x[0].length)
const ownerOf = (file) => {
  if (!file) return null
  const hit = unitPaths.find(([p]) => p !== '.' && (file === p || file.startsWith(p + '/')))
  return hit ? hit[1] : 'repo-root'
}
for (const e of model.module_edges) {
  const a = ownerOf(e.from), b = ownerOf(e.to)
  if (!a || !b || a === b) continue
  if (!dep.has(a)) dep.set(a, new Set())
  dep.get(a).add(b)
}

const unitByShort = new Map(model.units.map((u) => [shortOf(u.name), u]))
const shorts = [...allShorts].filter((s) => s !== 'repo-root').sort()

const L = ['[project]', 'language = "ts"', '']
L.push('[[project.excluded_sources]]', 'path = ".ai/skills/om-fix-specs/scripts"', 'reason = "python helper script for a repo agent skill; tooling, not product source"', '')
L.push('[[project.excluded_sources]]', 'path = ".ai/skills/om-wcag-guardian/scripts"', 'reason = "python helpers for a repo agent skill; tooling, not product source"', '')
L.push('')

const rootDeps = [...new Set([...(dep.get('repo-root') ?? []), ...ROOT_HOISTED])].filter((d) => allShorts.has(d)).sort()
const rootPatterns = ['scripts/*', '.ai/*', 'tests/*', 'docker/*', 'config/*', 'certs/*', '*.ts', '*.mjs', '*.cjs', '*.js', '*.json', '*.md']
L.push('[[module]]', 'name = "repo-root"', `matches = { units = ["open-mercato"], modules = [${rootPatterns.map((p) => `"${p}"`).join(', ')}] }`, '[module.allowed]', `depend_on = [${rootDeps.map((d) => `"${d}"`).join(', ')}]`, '')

for (const s of shorts) {
  const unit = unitByShort.get(s)
  const path = unit.path.replace(/\/+$/, '').replace(/^\.\//, '')
  const deps = [...(dep.get(s) ?? [])].filter((d) => allShorts.has(d) && !FORBIDDEN.has(`${s}|${d}`)).sort()
  const patterns = path === '.' ? ['*'] : [`${path}/*`]
  L.push('[[module]]', `name = "${s}"`, `matches = { units = ["${unit.name}"], modules = [${patterns.map((p) => `"${p}"`).join(', ')}] }`, '[module.allowed]', `depend_on = [${deps.map((d) => `"${d}"`).join(', ')}]`, '')
}

// Package-tier cycle ratchet. The app is the composition root (imports and is
// imported by design); repo-root tooling edges would only add linker noise.
L.push('[[constraint]]')
L.push('type = "no_cycles"')
const cycleModules = shorts.filter((s) => s !== 'app')
L.push(`modules = [${cycleModules.map((s) => `"${s}"`).join(', ')}]`)
L.push('')

writeFileSync('architecture.spec.toml', L.join('\n') + '\n')
console.log(`wrote architecture.spec.toml — ${shorts.length + 1} modules from ${modelPath}`)
