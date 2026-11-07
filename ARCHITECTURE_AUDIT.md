# Architecture audit (archspec)

Audit of the monorepo dependency graph using [`@mateuszwrobel/archspec`](https://github.com/mateuszwrobel/archspec) 0.6.30,
added as a root dev dependency. Findings below were produced against `main` at commit `cc82ba769` and are reproducible:

```bash
corepack yarn install                        # archspec is a root devDependency
corepack yarn archspec scan --output /tmp/archspec-model.json
corepack yarn archspec verify                # the boundary guard (red — see "Artifacts")
node scripts/archspec/gen-intended-spec.mjs /tmp/archspec-model.json   # regenerate the spec
node scripts/archspec/gen-diagram.mjs /tmp/archspec-model.json docs/architecture/package-graph.mmd
```

Model facts: 47 workspace units, 58,577 file-level import edges, 304 external specifiers.
`verify` verdict: **3 forbidden imports, 52 missing dependency declarations, package-level cycle, 19 warnings.**
Report-only stderr (~2,000 lines) is dominated by `workspace target not built` — expected before a build pass; it never affects the verdict.

## Findings

### F1 — Test files are a typecheck blind spot (proven, partially fixed)

`packages/core/src/modules/payment_gateways/lib/__tests__/webhook-processor.test.ts` and
`webhook-route-envelope.test.ts` imported two nonexistent modules (`./gateway-service`,
`../../integrations/log-service`). Fixed in `bb08e46e1`. Why CI never saw it:

1. `packages/core/tsconfig.json` excludes `**/__tests__/**`, so `yarn typecheck` never parses them.
2. The broken imports were `import type` — erased by the jest transform before any resolution;
   the suites passed **on the broken files** (demonstrated: `tsc` 4× TS2307, `jest` 2/2 green on the same content).
3. ESLint has no `import/no-unresolved`.

Residual: even after the fix these two files still emit `TS2554`/`TS2339` (mis-typed `jest.fn()` mocks).
Any repo change that includes tests in typecheck will surface more of these.

### F2 — One 10-package dependency cycle

At package granularity the shipped graph (manifest ∪ source imports, test-only edges and the `app`
composition root excluded) contains a single SCC:

`core ↔ shared ↔ ui ↔ ai-assistant ↔ cache ↔ queue ↔ events ↔ search ↔ cli ↔ telemetry`

`verify`'s `no_cycles` constraint reports the headline triangle `ai-assistant -> ui -> core -> ai-assistant`
plus 11 file-level React import cycles *inside* single packages (mutual `Component.tsx` ↔ `ComponentImpl.tsx`
imports in core/enterprise — real but independent of the package cycle).

### F3 — Forbidden boundary imports

Pairs the layering forbids (`architecture.spec.toml` withholds them from `depend_on`). "Sites" are
import-statement files; *adjudicated* = whether verify's ceiling sees them (it counts declared and
relative-path imports; undeclared bare-specifier imports stay report-only — archspec#7):

| pair | declared | sites (src/test/tool) | adjudicated | note |
|---|---|---|---|---|
| `core -> ai-assistant` | devDep | 25 shipped src | **disallowed** | platform core imports a product module (`catalog/ai-tools/*` packs) |
| `shared -> cache` | dep | 7 shipped src | **disallowed** | breaks shared's leaf status at the manifest level |
| `ui -> core` | undeclared | 14 (`.storybook` relative imports) | **disallowed** | relative paths bypass the manifest |
| `shared -> core` | undeclared | 13 shipped src | report-only | latent; becomes disallowed once declared/built |
| `shared -> ui` | undeclared | 1 file | report-only | |
| `shared -> events` | undeclared | 1 file | report-only | |
| `ui -> ai-assistant` | undeclared | 1 file | report-only | |
| `ui -> app` | undeclared | 5 (Storybook i18n JSON) | not adjudicated | asset imports |

`shared` importing anything at all contradicts AGENTS.md's layering; `core -> ai-assistant` is the
largest shipped-code inversion.

### F4 — Phantom dependencies (52 `missing edge` verdicts)

Imports that resolve only through hoisted `node_modules` links; each verdict = a package.json edit.

| class | pairs | fix |
|---|---|---|
| **A. shipped source, undeclared** | `ai-assistant -> core,queue,search` · `app -> storage-s3` · `checkout -> queue` · `cli -> core` · `core -> cache,events,queue,search,storage-s3` · `enterprise -> cache` · `onboarding -> core,search` · `search -> cache` · `webhooks -> events` | add `workspace:*` dependency |
| **B. test-only** | `core -> app` (i18n fixture) · `scheduler -> core` · `telemetry -> core` | add devDependency (devDeps satisfy the floor) |
| **C. package tooling -> repo-root** | `cache,cli,events,queue,storage-s3,webhooks,channel-{resend,ses,smtp},gateway-{autopay,tpay},sync-akeneo,web-research{,-browser,-exa,-firecrawl,-model,-serp,-searxng,-tavily} -> repo-root` (build.mjs / watch.mjs / jest configs importing `scripts/*`) | blocked: root isn't a valid dependency target; needs spec support (archspec#8) |
| **D. repo-root tooling -> packages** | `repo-root -> cli,eslint-plugin-ds` (+ 20 hoisted pairs already green) | optional: declare root devDependencies for honesty |
| **E. create-app templates** | `create-mercato-app -> {ai-assistant,app,cache,documents,enterprise,events,gateway-stripe,queue,search,telemetry,webhooks}` — template scaffolds importing real packages at scan time | policy choice: devDeps vs excluding `template/` |

### F5 — Root tooling bypasses manifests

`scripts/*.ts` import workspace packages by bare specifier with nothing declared in the root
manifest; verify enforces them as edges that `scan`'s model never shows (archspec#7). Harmless at
runtime (hoisting), invisible to model-driven analysis.

## Remediation order (suggested)

1. **Declare class A+B** (~22 manifest lines) — mechanical, turns 22 reds green without code changes.
2. **Break F3 inversions**: invert `core -> ai-assistant` via injection/registry (25 sites), audit
   `shared -> *` imports (leaf contract), move Storybook catalogue imports out of the shipped `ui` tier.
3. **Break the F2 cycle** by re-cutting `shared` (types vs runtime) and moving provider-ish pieces
   (cache/queue/events) behind core interfaces — the cycle cannot be broken by declaration changes alone.
4. Decide C/E policy (tooling exclusion in spec; template classification), then flip the guard in
   `scripts/__tests__/archspec-boundaries.test.mjs` green.

## Upstream tool gaps found (filed against archspec)

[#5](https://github.com/mateuszwrobel/archspec/issues/5) depgraph folds to file level on this tree ·
[#6](https://github.com/mateuszwrobel/archspec/issues/6) report says "cycles detected: 0" without a constraint ·
[#7](https://github.com/mateuszwrobel/archspec/issues/7) scan model vs verify edge-set disagree (both directions;
see the refinement comment — undeclared bare imports are adjudicated from root but not from package units) ·
[#8](https://github.com/mateuszwrobel/archspec/issues/8) excluded_sources has no patterns and fails the run on
imports into excluded territory (blocks class C fix) ·
[#9](https://github.com/mateuszwrobel/archspec/issues/9) no violation coloring in rendered graphs (why we need
`scripts/archspec/gen-diagram.mjs`) ·
[#10](https://github.com/mateuszwrobel/archspec/issues/10) depend_on two-layer semantics undocumented (devDeps
satisfy the floor; phantom pairs cannot pass either way; test-gated edge handling ambiguous).

## Artifacts

| file | role |
|---|---|
| `architecture.spec.toml` | boundary spec (red until findings are fixed; regenerate per commands above) |
| `scripts/__tests__/archspec-boundaries.test.mjs` | guard test wired into `yarn test:scripts` — currently **fails by design** |
| `docs/architecture/package-graph.mmd` | colored package graph (red = forbidden, orange dashed = phantom) |
| `scripts/archspec/gen-intended-spec.mjs` | spec generator |
| `scripts/archspec/gen-diagram.mjs` | diagram generator |
