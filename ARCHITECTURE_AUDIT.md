# Architecture audit (archspec)

Audit of the monorepo dependency graph using [`@mateuszwrobel/archspec`](https://github.com/mateuszwrobel/archspec) 0.6.30,
added as a root dev dependency. Original findings below were produced against `main` at commit `cc82ba769` and are
reproducible; the **Remediation** section records what was changed to turn the guard green:

```bash
corepack yarn install                        # archspec is a root devDependency
corepack yarn archspec scan --output /tmp/archspec-model.json
corepack yarn archspec verify                # the boundary guard — green on an unbuilt checkout (see "Artifacts")
node scripts/archspec/gen-intended-spec.mjs /tmp/archspec-model.json   # regenerate the spec
node scripts/archspec/gen-diagram.mjs /tmp/archspec-model.json docs/architecture/package-graph.mmd
```

Model facts (at audit time): 47 workspace units, 58,577 file-level import edges, 304 external specifiers.
Original `verify` verdict: **3 forbidden imports, 52 missing dependency declarations, package-level cycle, 19 warnings.**
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

### F2 — One 10-package dependency cycle — RESOLVED

At package granularity the shipped graph (manifest ∪ source imports, test-only edges and the `app`
composition root excluded) contained a single SCC:

`core ↔ shared ↔ ui ↔ ai-assistant ↔ cache ↔ queue ↔ events ↔ search ↔ cli ↔ telemetry`

Broken by the moves below plus manifest reallocation; `no_cycles` now passes:

- **`core ↔ ai-assistant`**: the AI SDK contract cluster (`ai-agent-definition`, `ai-tool-definition`,
  `ai-api-operation-runner`, `api-backed-tool`, `types`) moved into `packages/core/src/lib/ai/` — the
  contracts are platform surface consumed by core module ai-tool packs, so core is their home. The two
  runtime call sites that needed ai-assistant's `model-factory` (`warranty_claims/lib/aiAssist.ts`,
  `inbox_ops/lib/llmProvider.ts`) use the lazy optional-peer `await import(...)` idiom; core no longer
  declares ai-assistant at all (report-only optional peer, precedent: `ai-draft-runner`).
- **`shared ↔ cache`**: `CacheStrategy` (+ companion types) moved to `packages/shared/src/lib/cache/types.ts`;
  `@open-mercato/cache` type-only re-exports it. Shared is a leaf again.
- **`ui ↔ core`**: static core imports removed from `packages/ui/src` entirely (see placement table below);
  `ui -> core` stays armed in the spec's disallow list as a ratchet.
- **`core ↔ events/queue/search/telemetry`**: class-A declarations landed (`core -> cache,events,queue`);
  `search`/`telemetry -> core` bare imports were deliberately left undeclared (adding them re-creates
  package-tier cycles via `core -> events -> queue -> telemetry` and the search bootstrap wiring) and are
  listed in the generator's `UNDECLARED_OPTIONAL_PAIRS` — report-only under the hoist law.
- **11 file-level React cycles** inside core/enterprise broken at file level (types extracted next to the
  implementations, e.g. `packages/ui/src/backend/charts/types.ts`).

### F3 — Forbidden boundary imports — RESOLVED

| pair | was | now |
|---|---|---|
| `core -> ai-assistant` | disallowed (25 shipped sites) | contracts moved into core lib; 2 optional-peer lazy call sites; pair undeclared (report-only) |
| `shared -> cache` | disallowed | `CacheStrategy` relocated to shared; edge gone |
| `ui -> core` | disallowed (14 Storybook relative imports) | zero static core imports in `packages/ui/src`; storybook territory excluded from the model |
| `shared -> core / ui / events`, `ui -> ai-assistant` | report-only latents | unchanged by design — undeclared bare imports stay report-only; they become visible the moment anyone declares them |
| `create-app -> core/ui` | disallowed | payload dirs (`template`, `agentic`) emitted as excluded directory sources — scaffolded-app code targets the generated app's graph, not this repo's |

### F4 — Phantom dependencies (52 `missing edge` verdicts) — RESOLVED

- Class A+B: real workspace deps/devDeps declared (~22 manifest lines).
- Class C (package tooling -> repo-root): every config file importing `scripts/*` converted to opaque root
  imports so the edge resolves to the repo-root unit; `ROOT_PHANTOM_SKIP` documents the residual exemptions.
- Class D: root devDeclarations added where honest.
- Class E (create-app templates): resolved by the payload-directory exclusion (F3), not by deps.
- Reverse-phantom class (declared-but-test-only): `core -> storage-s3` existed only as a core devDependency
  whose sole consumer is a Playwright fixture. archspec folds devDependencies into the manifest floor
  (issue #10), so the pair declared = package-tier cycle `core -> storage-s3 -> core`, undeclared with the
  file in-graph = disallowed. Fixed honestly: devDependency removed (the fixture resolves via workspace
  hoisting like root tooling does), the fixture's `__integration__` territory excluded from the graph, and
  the pair pinned undeclared.

### F5 — Root tooling bypasses manifests — RESOLVED

`scripts/*.ts` bare workspace imports are now declared in the root manifest where meaningful; remaining
report-only pairs are documented in the generator (`ROOT_HOISTED` pins the pairs verify sees through
hoisted links in the adjudicated unbuilt state — `content` and `scheduler` were removed from the pins:
their edges only materialize when workspace dist exists, and dist-present trees are never adjudicated,
so the pins read as phantom `missing edge` verdicts on clean runs;
`ROOT_PHANTOM_SKIP` gained `create-mercato-app` whose repo-root endpoint edge never materializes).

### F6 — Peer surface fallout from the manifest reallocation — RESOLVED

`scripts/check-package-peer-deps.mjs` (registered in the scripts suite) adjudicates standalone-install
peer satisfaction and surfaced what the reallocation shifted into transitive position:

- `search` (core's peer) and `queue` (search's peer) are marked `peerDependenciesMeta.optional`: both are
  reached only through lazy `await import(...)` / DI injection, and backend-only consumers must not be
  forced to install them (the marking removed a 20-package violation wave).
- `react`/`react-dom`/`ui` stay **non-optional** core peers (their pre-surgery shape): the guard counts
  only non-optional peers as shipped, and `@xyflow/react` — now a real core dependency from the moved
  flow UI — transitively requires react.
- `ui` now **ships** `react-is` as a direct dependency instead of peer-requiring it, which is exactly what
  the peer-allowlist's own `followUp` prescribed; it retired the 13 pinned `-> ui -> react-is` entries, and
  the 14 stale `provider -> core -> ai-assistant` entries (the peer died with F2's contract relocation).
  `--update-allowlist` pruned both classes; 10 genuinely pre-existing entries remain.
- `cli` moved `@open-mercato/core` to devDependencies: its only static imports are in tests, runtime
  reaches core through dynamic `import()` inside the host app project, and archspec still folds the
  devDependency into the manifest floor (issue #10), so the spec is unaffected.
- `onboarding` shipped client components while declaring none of them: added `ui` + `shared` deps and
  `react`/`react-dom` peers, mirroring `checkout`'s pattern.

## Placement of moved code

Every relocation is justified by responsibility, not by the tool — each new home matches the surrounding
conventions, and old paths keep type/re-export shims per the deprecation protocol:

| artifact | new home | why this home |
|---|---|---|
| AI SDK contract cluster + attachment bridge types/parts | `packages/core/src/lib/ai/` | platform contracts consumed by core module ai-tool packs; `core/src/lib/**` is package glue (module-independent) |
| `CacheStrategy` et al. | `packages/shared/src/lib/cache/types.ts` | DI cache contract referenced by shared's CRUD plumbing; shared owns cross-cutting contracts, cache re-exports |
| `imageUrls` | `packages/shared/src/lib/attachments/` | pure URL builders used by server routes and client previews |
| `changeRows` | `packages/shared/src/lib/audit/` | pure diff-row types/helpers shared by core audit UI and ui version-history |
| `display-helpers.tsx` | `packages/ui/src/backend/version-history/` | JSX audit-diff display; the family already hosts audit-adjacent helpers (`labels.ts`, `useAuditPermissions.ts`) |
| dictionary selects / appearance plumbing / data hooks | `packages/ui/src/backend/dictionaries/` | client UI primitives over `/api/dictionaries`; `AppearanceDialog` now sits with the appearance plumbing it depends on instead of `customers` |
| `AttachmentContentPreview` | `packages/ui/src/backend/attachments/` | primitives-only file/image preview UI |
| message object-type + UI registries | `packages/shared/src/modules/messages/` | adjacent to the existing `messages/types` contract; globalThis registry pattern per convention |
| field-registration loader registry | `packages/shared/src/lib/fields/registrations.ts` (registry) + `packages/core/src/lib/fields/registrations.ts` (core's enumeration) | registry is a shared globalThis registry (precedent: `crud/mutation-guard-registry`); the module enumeration is package glue in core's `src/lib`, invoked from the core client bootstrap entry — no framework module hardcodes sibling modules |

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
| `architecture.spec.toml` | boundary spec — generated by `gen-intended-spec.mjs` from the specless scan model |
| `scripts/__tests__/archspec-boundaries.test.mjs` | guard test wired into `yarn test:scripts` and into CI **before** build-artifact download (state-aware skip on built trees) — **green** |
| `docs/architecture/package-graph.mmd` | colored package graph (red = forbidden, orange dashed = phantom) |
| `scripts/archspec/gen-intended-spec.mjs` | spec generator (single source of truth for the spec; re-run after any dependency-moving change) |
| `scripts/archspec/gen-diagram.mjs` | diagram generator |

Generator law baked into `gen-intended-spec.mjs`: `depend_on` = manifest ∪ source edges minus
`FORBIDDEN` (armed ratchets: `ui -> core`, `shared -> core` latents) minus `UNDECLARED_OPTIONAL_PAIRS`
(optional peers whose declaration would create package-tier cycles: `telemetry|core`, `search|core`,
`core|storage-s3`, `app|web-research-*`). Excluded territory: tooling config files, payload/tooling/
`__integration__` fixture directories, and repo-wide-guard classified audits — plus a deterministic
**filesystem importer closure**: every file whose relative import resolves into excluded territory is
emitted as `excluded_sources` too, because archspec fails loud on imports into excluded paths and the
scan model's `module_edges` only carries inter-unit edges (issue #7), which made an edges-only cascade
flaky across link states. `ROOT_HOISTED` / `ROOT_PHANTOM_SKIP` pin repo-root endpoint pairs per the
rediscovery comments in the script. Verify precondition law (established empirically + via `archspec help diagnostics`): archspec adjudicates the
**unbuilt source graph**. With `dist/` present, deep subpath imports resolve through the exports map's
`default` arm into the built files — build output is excluded territory — and each fails loud
(`resolves only into excluded path dist`); with `dist/` absent the same imports land on the `types`-condition
source answer (`workspace target not built`, report-only). Generated gitignored targets follow the same law:
absent = report-only (`generated source not built — gitignored`), present-but-gitignored = unresolvable.
The guard therefore self-skips when build/generated output exists, and CI runs it explicitly *before* the
build-artifacts download in the test job.
