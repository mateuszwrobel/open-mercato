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

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

import { REPO_WIDE_GUARDS, CROSS_PACKAGE_EXCEPTIONS } from '../repo-wide-guards.mjs'

const modelPath = process.argv[2] ?? 'archspec-model.json'
const model = JSON.parse(readFileSync(modelPath, 'utf8'))

// Scaffold payload shipped as files, never imported as product source. Its
// bare @open-mercato/* imports resolve only in a generated app, so they must
// not adjudicate against this monorepo's manifests. The dirs are excluded;
// files elsewhere in create-app that import into them by relative path
// (dev-runner parity tests, link inventories) are picked up by the filesystem
// importer closure below, which keeps verify free of dangling-import errors.
const PAYLOAD_DIRS = ['packages/create-app/template', 'packages/create-app/agentic']
const underPayload = (file) => PAYLOAD_DIRS.some((d) => file.startsWith(d + '/'))
// Storybook build-time harness lives inside packages/ui but imports app-layer
// catalogues by relative path; it is not shipped product code. As a directory
// territory it is excluded from the graph entirely (nothing imports into it).
const TOOLING_DIRS = ['packages/ui/.storybook']

// Playwright integration spec territory (per package/module). Its fixtures
// import infrastructure by devDependency/hoisted link (e.g. the S3 fixtures
// that would otherwise fabricate a core -> storage-s3 -> core cycle); their
// cross-package plumbing is test wiring, not product source. Nothing outside
// `__integration__` dirs imports into them (verified: no static importers),
// so the dirs exclude cleanly. Rediscover stragglers from verify's
// `resolves only into excluded path` lines naming an __integration__ dir.
const TEST_FIXTURE_DIRS = [
  'packages/core/src/modules/core/__integration__',
  'packages/core/src/modules/attachments/__integration__',
]

// Files classified in scripts/repo-wide-guards.mjs are deliberate cross-package
// audits (guards or documented exceptions). They read other workspaces on
// purpose, so their edges describe repo auditing, not product wiring; the
// manifest classification stays the single source of truth for them.
const classifiedFiles = new Set([
  ...REPO_WIDE_GUARDS.flatMap((g) => g.tests.map((t) => `${g.workspaceDir}/${t.path}`)),
  ...(CROSS_PACKAGE_EXCEPTIONS ?? []).map((e) => e.path),
])

// Boundaries the architecture must not allow. Each entry is evidence-backed in
// ARCHITECTURE_AUDIT.md (forbidden-import table with import-site counts).
const FORBIDDEN = new Set([
  'shared|cache', 'shared|core', 'shared|events', 'shared|ui',
  'ui|core', 'ui|ai-assistant', 'ui|app',
  'core|ai-assistant',
])

// Pairs that are optional couplings by design and intentionally NOT declared,
// because declaring them would create a package-tier dependency cycle:
// - telemetry|core: only Playwright specs import `core/helpers/integration/*`;
//   telemetry's runtime never touches core (core→events→queue→telemetry→core).
// - search|core: search resolves core's query_index scope via lazy dynamic
//   import and consumes ProgressService structurally; core→search stays
//   declared because core's bootstrap wires search unconditionally.
// - core|storage-s3: only Playwright fixtures (`__integration__/helpers/
//   s3Fixtures.ts`) import storage-s3; core's runtime never does (the manifest
//   entry lives in devDependencies). Excluded at the source (below); the pair
//   stays undeclared so no core -> storage-s3 -> core cycle can form.
// - app|web-research-*: the app wires research adapters only through the
//   ephemeral `.mercato/generated/web-research-adapters.generated.ts` registry.
//   That file is gitignored and generated on demand, so the edges appear in
//   scans only when a local generate has run; declaring them would make verify
//   order-dependent (missing edge without the registry). The hoist law keeps
//   them report-only; a direct import from app source would still adjudicate.
// The bare undeclared imports stay report-only per the hoist law.
const UNDECLARED_OPTIONAL_PAIRS = new Set([
  'telemetry|core', 'search|core', 'core|storage-s3',
  'app|web-research', 'app|web-research-browser', 'app|web-research-exa',
  'app|web-research-firecrawl', 'app|web-research-model', 'app|web-research-searxng',
  'app|web-research-serp', 'app|web-research-tavily',
])

// Bare-specifier imports from repo-root tooling that verify resolves through
// hoisted workspace links. The scan model materializes only root imports that
// point at real files (relative paths or package exports) — re-confirmed on
// archspec 0.6.45: module_edges carry root->member edges for those alone (9
// pairs), while hoisted bare-specifier resolution stays verify-only. So the
// remaining pairs are pinned here. To rediscover: run verify with this spec
// and grep `disallowed cross-component dependency: repo-root ->`.
// packages-tier edges verify may see through hoisted links only when workspace
// dist is built (deep specifiers land on types/src otherwise); in the unbuilt
// state this guard adjudicates, verify drops those edges and the pins read as
// phantom `missing edge` verdicts. Pairs here must match verify's unbuilt graph;
// re-discover by reading 'missing edge: repo-root -> X' lines from a clean run.
// (Removed 2026-11: 'content', 'scheduler' — their edges only materialized in
// built-tree runs; see ARCHITECTURE_AUDIT.md F5.)
const ROOT_HOISTED = [
  'ai-assistant', 'app', 'carrier-inpost', 'channel-apns', 'channel-discord',
  'channel-expo', 'channel-fcm', 'channel-gmail', 'channel-imap', 'checkout',
  'core', 'documents', 'gateway-stripe', 'onboarding',
  'search', 'sync-akeneo', 'telemetry', 'tillio', 'ui', 'webhooks',
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
// Package config files that import repo-root tooling by relative path
// (build.mjs -> ../scripts/build-package.mjs etc.). They are excluded from
// scanning: the root package is not a valid dependency target, so the pair
// could never pass the manifest floor. Any other import into repo-root stays
// in depend_on and therefore fails verify — the ratchet keeps working.
const TOOL_CONFIG_FILES = new Set(['build.mjs', 'watch.mjs', 'jest.config.cjs', 'jest.dom.setup.ts', 'next.config.ts', 'playwright.config.ts', 'stryker.conf.mjs'])
const isToolConfig = (file) => TOOL_CONFIG_FILES.has(file.split('/').pop())
const excludedConfigs = new Set()
for (const e of model.module_edges) {
  if (ownerOf(e.to) === 'repo-root' && ownerOf(e.from) !== 'repo-root' && isToolConfig(e.from)) {
    excludedConfigs.add(e.from)
  }
}
// Excluded territory = tooling configs + payload dirs + classified audits.
// Anything that imports INTO that territory must itself be excluded: verify
// fails loud on dangling imports into excluded paths, and files reaching the
// payload/config/scaffold tree are by definition tooling, not product source.
// Classified files are excluded whenever they appear in the graph at all:
// verify would otherwise adjudicate their deliberate cross-workspace reads
// (audits, not wiring), so scan-exclusion silences them at the edge source.
const edgeSources = new Set(model.module_edges.map((e) => e.from))
const excludedFiles = new Set(excludedConfigs)
for (const f of classifiedFiles) if (edgeSources.has(f)) excludedFiles.add(f)
const underExcluded = (file) => excludedFiles.has(file) || TOOLING_DIRS.some((d) => file.startsWith(d + '/')) || TEST_FIXTURE_DIRS.some((d) => file.startsWith(d + '/')) || underPayload(file)
for (let grew = true; grew;) {
  grew = false
  for (const e of model.module_edges) {
    if (underExcluded(e.to) && !underExcluded(e.from)) { excludedFiles.add(e.from); grew = true }
  }
}
// module_edges is only populated for inter-unit edges and its completeness
// still varies with the scanned tree, so the importer closure cannot
// rely on it. Walk the tree instead: any file whose relative import
// specifier resolves into excluded territory is itself excluded (verify fails
// loud on imports into excluded paths). Iterate to fixpoint for importers of
// importers. Skipped trees are either unscanned by archspec or payload
// already excluded wholesale.
const WALK_SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.next', '.mercato', 'generated', 'external', '.cache', 'coverage', 'storage', 'data'])
const SOURCE_EXT = ['.ts', '.tsx', '.mjs', '.cjs', '.js']
const repoRoot = process.cwd()
const sourceFiles = []
const walk = (dir) => {
  for (const entry of readdirSync(join(repoRoot, dir), { withFileTypes: true })) {
    const rel = dir ? `${dir}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      if (!WALK_SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) walk(rel)
    } else if (SOURCE_EXT.some((x) => entry.name.endsWith(x))) {
      sourceFiles.push(rel)
    }
  }
}
walk('')
const IMPORT_SPEC_RE = /(?:\bfrom\s*|\brequire\s*\(\s*|\bimport\s*\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g
const resolveRelative = (fromFile, spec) => {
  const rel = relative(repoRoot, resolve(repoRoot, dirname(fromFile), spec))
  const candidates = [rel, ...SOURCE_EXT.map((x) => rel + x), ...SOURCE_EXT.map((x) => `${rel}/index${x}`)]
  return candidates.find((c) => existsSync(join(repoRoot, c))) ?? null
}
for (let grew = true; grew;) {
  grew = false
  for (const file of sourceFiles) {
    if (underExcluded(file)) continue
    let text
    try { text = readFileSync(join(repoRoot, file), 'utf8') } catch { continue }
    if (!text.includes('./') && !text.includes('../')) continue
    for (const match of text.matchAll(IMPORT_SPEC_RE)) {
      const target = resolveRelative(file, match[1])
      if (target && underExcluded(target)) { excludedFiles.add(file); grew = true; break }
    }
  }
}
for (const e of model.module_edges) {
  const a = ownerOf(e.from), b = ownerOf(e.to)
  if (!a || !b || a === b) continue
  if (underExcluded(e.from) || underPayload(e.from)) continue
  if (!dep.has(a)) dep.set(a, new Set())
  dep.get(a).add(b)
}

const unitByShort = new Map(model.units.map((u) => [shortOf(u.name), u]))
const shorts = [...allShorts].filter((s) => s !== 'repo-root').sort()

const L = ['[project]', 'language = "ts"', '']
L.push('[[project.excluded_sources]]', 'path = ".ai/skills/om-fix-specs/scripts"', 'reason = "python helper script for a repo agent skill; tooling, not product source"', '')
L.push('[[project.excluded_sources]]', 'path = ".ai/skills/om-wcag-guardian/scripts"', 'reason = "python helpers for a repo agent skill; tooling, not product source"', '')
for (const cfg of [...excludedFiles].sort()) {
  L.push('[[project.excluded_sources]]', `path = "${cfg}"`, 'reason = "tooling/audit file: build-test config importing repo-root scripts, classified cross-package audit (scripts/repo-wide-guards.mjs), importer of excluded payload/config/fixture territory, or a transitive importer of one of these"', '')
}
for (const d of TOOLING_DIRS) {
  L.push('[[project.excluded_sources]]', `path = "${d}"`, 'reason = "build-time story harness importing app-layer catalogues; not shipped product code"', '')
}
for (const d of TEST_FIXTURE_DIRS) {
  L.push('[[project.excluded_sources]]', `path = "${d}"`, 'reason = "playwright integration spec territory: fixtures and specs whose infrastructure imports are devDependency-backed test wiring, not product source"', '')
}
for (const d of PAYLOAD_DIRS) {
  L.push('[[project.excluded_sources]]', `path = "${d}"`, 'reason = "scaffolded-app payload: template source targets the generated standalone app\'s dependency graph, not this repo\'s package boundaries"', '')
}
L.push('')

const rootDeps = [...new Set([...(dep.get('repo-root') ?? []), ...ROOT_HOISTED])].filter((d) => allShorts.has(d)).sort()
// Suffix patterns ('*.ts' …) are how archspec expresses the hoist law: files
// anywhere that match them also resolve through the root unit, which is what
// satisfies the FLOOR of any pair whose target resolves via node_modules
// symlinks. The side effect is that every package file secondarily matches
// repo-root at the component layer, so every importing module needs
// "repo-root" in depend_on (added below) to cover those phantom endpoint
// edges. Subtree claims pin the real root tooling.
const rootPatterns = ['scripts/*', '.ai/*', 'tests/*', 'docker/*', 'config/*', 'certs/*', '*.ts', '*.mjs', '*.cjs', '*.js', '*.json', '*.md']
L.push('[[module]]', 'name = "repo-root"', `matches = { units = ["open-mercato"], modules = [${rootPatterns.map((p) => `"${p}"`).join(', ')}] }`, '[module.allowed]', `depend_on = [${rootDeps.map((d) => `"${d}"`).join(', ')}]`, '')

// Suffix matching makes repo-root a secondary endpoint of some (not all)
// cross-unit imports at the component layer; which modules end up with those
// phantom edges is a verify-internal detail this model cannot reproduce.
// Modules listed here must NOT declare repo-root (its floor would fail);
// re-discover by reading 'verify' missing-edge lines naming repo-root.
const ROOT_PHANTOM_SKIP = new Set([
  'cache', 'channel-resend', 'channel-ses', 'channel-smtp', 'cli', 'create-mercato-app',
  'eslint-plugin-ds', 'events', 'gateway-autopay', 'gateway-tpay', 'queue', 'starter',
  'storage-s3', 'web-research', 'web-research-browser', 'web-research-exa',
  'web-research-firecrawl', 'web-research-model', 'web-research-searxng',
  'web-research-serp', 'web-research-tavily',
])
const modulesWithEdges = new Set(model.module_edges.map((e) => ownerOf(e.from)))

for (const s of shorts) {
  const unit = unitByShort.get(s)
  const path = unit.path.replace(/\/+$/, '').replace(/^\.\//, '')
  const deps = [...(dep.get(s) ?? [])].filter((d) => allShorts.has(d) && !FORBIDDEN.has(`${s}|${d}`) && !UNDECLARED_OPTIONAL_PAIRS.has(`${s}|${d}`)).sort()
  if (modulesWithEdges.has(s) && !ROOT_PHANTOM_SKIP.has(s)) deps.push('repo-root')
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
