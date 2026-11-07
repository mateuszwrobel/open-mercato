# Boundary Surgery — Docs-Compliance Follow-ups Plan

> **Status: PARKED.** Written 2026-11-07 after re-evaluating the archspec boundary surgery (`d96957710` on `chore/archspec-dev-dependency`, fork remote) against the project's *written* doctrine (AGENTS.md files, `BACKWARD_COMPATIBILITY.md`), not just the archspec enforcement layer. Extended same day by a second review pass over the manifest-reallocation, peer-surface, and field-registrar lanes. Work resumes only when explicitly picked up.

**Goal:** Close the gap between the boundary surgery (archspec-green, architecturally justified by written rules) and what the source actually does: `@deprecated` shims, a spec with Migration & BC section, UPGRADE_NOTES, the tooling-invisible `shared↔cache` cycle, three **optional-peer misclassifications** (static imports against `optional:true`), misdeclared manifest classes, and a fictional "generated"-file doctrine.

**Branch:** continue on `chore/archspec-dev-dependency` (fork `mateuszwrobel/open-mercato`, base commit `d96957710`, PR to upstream deferred by the maintainer).

**Spec promotion:** per `BACKWARD_COMPATIBILITY.md` protocol step 5, execute against a spec at `.ai/specs/2026-11-XX-boundary-surgery-docs-compliance.md` with a "Migration & Backward Compatibility" section. Promote this plan into that spec when starting Phase 1.

**Rule anchors:**
- `BACKWARD_COMPATIBILITY.md:157` (§4): moved paths MUST be re-exported with `@deprecated`. Protocol steps 2/4/5: JSDoc, UPGRADE_NOTES, spec.
- `packages/core/AGENTS.md:242-252`: optional integration = consumer owns glue, resolves in try/catch, **no unconditional resolve/hard-require**; upstream MUST NOT import consumers.
- `packages/shared/AGENTS.md:3,20`: leaf, no core/domain imports; centralize reusable types.
- `ARCHITECTURE_AUDIT.md` F3/F4/F6 rationales — several are now known to be partly false at source level (see Phases 2 and 6; fix prose in Phase 5).

---

## Resumption protocol (read first)

Tree state left by last session: **UNBUILT, un-generated** (correct for `archspec verify`).
1. Exit 127 (`command not found: jest`) → `corepack yarn install` (workspace bin links vanish intermittently).
2. Dev work: `yarn build:packages && yarn generate` first. **NEVER `yarn clean:generated`** (deletes committed generated files).
3. Guard runs need fresh/no-build state. Scan workflow: `mv architecture.spec.toml aside && corepack yarn archspec scan --output /tmp/opencode/model.json && node scripts/archspec/gen-intended-spec.mjs /tmp/opencode/model.json && corepack yarn archspec verify` (verdicts on stdout; exit 0 = green).
4. `git checkout -- architecture.spec.toml` restores the RED audit spec — recover via generator, never checkout.
5. Verify stdout DOES report the `shared → cache` root-import edge as `undeclared member import` (report-only); the `maintenance.ts` re-export edge stays scanner-invisible. Don't conclude "silent" from an empty verdict list alone.

---

## Phase 1 — `@deprecated` JSDoc on relocation shims (must)

Shims from `d96957710` re-export old paths with no `@deprecated` — literal §4:157 violation.

- [ ] **Enumerate**: `git show d96957710 --diff-filter=AM --name-only --format='' | grep -E '^packages/(core|cache)/src/.*\.tsx?$'` — 12 core shims under `modules/{attachments,audit_logs,customers,dictionaries}/**` + `packages/cache/src/types.ts`. (`widgets/lib/injection.ts` and `messages/lib/message-objects-registry.ts` are glue, not shims.)
- [ ] Add `@deprecated` JSDoc naming the new canonical path + removal window ("bridge removed after one minor"). Keep cache/types.ts comment, add the tag.
- [ ] Verify: ui + cache package tests; spec regeneration stays byte-identical.

## Phase 2 — Break the `shared↔cache` source cycle (must)

Runtime edges both ways: `cache→shared` (`strategies/redis.ts:3`) + `shared→cache` (`crud/cache.ts:2` `runWithCacheTenant`, `cache/maintenance.ts:1` `export…from`). Both predate the surgery. Partly visible (report-only `undeclared member import`), partly invisible (re-export edges) — `no_cycles` can never fail on it in the unbuilt law's territory.

- [ ] Move `runWithCacheTenant` impl into `packages/shared`; cache re-exports from shared (inverts `crud/cache.ts:2` to a local import).
- [ ] Delete `packages/shared/src/lib/cache/maintenance.ts`; point consumers (`rg purgeConfiguredCachePatternsAcrossTenantScopes`) at `@open-mercato/cache/service` directly; add `cache` to **cli dependencies**.
- [ ] Regen spec; verify exit 0; shared/cache/cli suites; `node scripts/check-package-peer-deps.mjs` exit 0.

## Phase 3 — Peer-surface honesty (must) — second-review findings

Three "optional" marks contradict static imports; one runtime dep misfiled as dev.

- [ ] **core→search** (`packages/core/src/bootstrap.ts:16-19` static import of `registerSearchModule`/`createSearchDeleteSubscriber` vs `peerDependenciesMeta."@open-mercato/search".optional=true`, manifest :282-286). Fix: convert the bootstrap import to lazy `await import('@open-mercato/search')` **inside the existing try/catch at :252-268** (warn-and-continue already there). Side win: absence currently hits the catch-all at `shared/lib/di/container.ts:277-284`, which silently skips the ENTIRE core bootstrap — lazy import localizes degradation per AGENTS.md:252 ("degrades gracefully", not "vanish"). Keep `optional:true` — it becomes true.
- [ ] **search→core** (55 static non-type imports in shipped source — frontend components import `core/modules/directory/constants`/`scopeCookies`, routes/workers import more; search manifest declares core NOWHERE → hoisting phantom). The generator comment (`scripts/archspec/gen-intended-spec.mjs:68-70`) claims lazy/structural — false. Fix, in order: (1) land the core bootstrap lazy-import above so no `core→search` static edge remains; (2) add `@open-mercato/core` to search **peerDependencies (non-optional)**; (3) drop `'search|core'` from `UNDECLARED_OPTIONAL_PAIRS` (:83) and rewrite the comment to the true direction story; (4) regen spec — `search→core` enters `depend_on`, no cycle (order matters: doing 2-3 before 1 re-introduces a package-tier cycle F2 just broke). Then check peer-guard churn: `ai-assistant` deps search → must now ship core (already its peer — expect clean).
- [ ] **search→queue** (`src/queue/{vector,fulltext}-indexing.ts:1` static `createQueue`; `modules/search/di.ts:90-99,148-149` unconditional instantiation) vs `peerDependenciesMeta` optional. Fix: drop the `optional` meta (queue becomes a required peer — cycle-free, queue→shared only). Alternative (not preferred): lazy-wrap the two factory sites.
- [ ] **cache→shared**: runtime import (`strategies/redis.ts:3`) declared under **devDependencies** (`package.json:61`) — same dev/dep class error the commit fixed for cli/scheduler, missed here. Move to `dependencies`. Spec unaffected (devDeps fold into the floor).
- [ ] Verify: `archspec verify` exit 0 with `shared→cache`/`search→core` verdict churn as expected; core bootstrap-adjacent suites, search suite, peer guard + its 8 unit tests green.

## Phase 4 — Spec + UPGRADE_NOTES (must)

- [ ] `.ai/specs/{date}-boundary-surgery-docs-compliance.md` with Migration & BC section covering Phases 1-3/5 (protocol step 5).
- [ ] `UPGRADE_NOTES.md` entry: moved import paths old→new, bridge window. Peer-class moves are NOT a BC contract category (verified: the 14 categories exclude npm manifests) — no ceremony owed there; say so in the spec's BC section.

## Phase 5 — Documentation corrections (should)

- [ ] `ARCHITECTURE_AUDIT.md` F4 + commit-message echo: "dropped the phantom core→storage-s3 **devDependency**" is false — the entry **never existed in the manifest** (`git log -S` empty); what was dropped was the spec edge. Same error in `gen-intended-spec.mjs:71-74` ("the manifest entry lives in devDependencies") — rewrite both.
- [ ] F3/F2 wording: "edge gone / shared is a leaf" → type-level only until Phase 2 lands; F6 laziness claims → true only after Phase 3.
- [ ] `gen-intended-spec.mjs` `TEST_FIXTURE_DIRS`: add ui `__integration__` (TC-UI-001 fixture imports core).
- [ ] `repo-wide-guards.mjs`: add `CROSS_PACKAGE_EXCEPTIONS` entry for `core/__integration__/helpers/s3Fixtures.ts` → storage-s3 (Playwright-discovered at root, turbo-skip hazard absent; detector only scans `.test.ts` so the `.spec.ts` chain is undetectable — document the rationale).
- [ ] `packages/ai-assistant/AGENTS.md:1431`: stale in-package file reference (`ai-agent-definition.ts` → now `@open-mercato/core/lib/ai/…`); leave dated changelog entries as history.
- [ ] `packages/core/src/modules/inbox_ops/__tests__/llmProvider.factory.test.ts:21`: static ai-assistant import → lazy idiom.
- [ ] Prose home for package-tier law: `docs/architecture/dependency-rules.md` (layers + forbidden pairs + optional-peer semantics) linked from root AGENTS.md.

## Phase 6 — Registrar & generated-file doctrine (must on docs-law; clean on spec-law)

Second review verdict on `publishCoreFieldRegistrations`: spec-law clean (3/3 registrars preserved, disjoint-kind merge makes the phone-first reorder inert, anchor unconditional in both bootstrap partitions + all client profiles, no back-door cycle). Remaining are doctrine debts:

- [ ] `packages/ui/src/backend/fields/registry.generated.ts` is classified in `.ai/docs/module-development.md:65,82` as a **versioned generated file** ("never hand-edit") but **no generator emits it** (only unrelated `entity-fields-registry.ts` exists) and `d96957710`-era commits hand-edit it. Choose: write the generator, or reclassify the file in module-development.md as hand-maintained (drop the `.generated` name if so). Until then the enumeration lives in TWO hand-maintained sites (`registrations.ts` + `registry.generated.ts`) — a future generator reviving the old side-effect-import style would silently restore the forbidden `ui→core` edge. Whichever option, add a guard comment/test pinning that the generated file must never gain `@open-mercato/core` side-effect imports.
- [ ] `packages/core/src/lib/**` has no codified placement doctrine (root AGENTS.md "Where to Put Code" documents `src/lib` only for shared; `core/src/lib` precedent was minted by `d96957710` itself) — add a core AGENTS.md line so placement is decided, not excavated.
- [ ] Test gap: nothing pins `publishCoreFieldRegistrations`' enumeration or the publish-before-flush semantics — dropping either loader line fails no test. Add one test in core (loader count + flush ordering) and one in shared (`registerFieldRegistrationsLoader` once/immediate).
- [ ] Nits: shared `registrations.ts:50` loader array grows under HMR double-publish (benign but unbounded); `:51` swallows post-flush loader rejections — at least `logger.warn`.
- [ ] `shared/package.json` exports: add a literal `./lib/fields/registrations` entry (currently resolves via wildcard; all other 19 lib paths are literal).

## Phase 7 — Upstream hygiene (nice)

- [ ] Upstream archspec issue: source-graph mode / cycle detection across `export…from` edges + built-tree deep-import verify (motivating examples: Phase 2 cycle, Phase 3 optional-vs-static). Extends #7/#8; #10 covers devDep-floor.
- [ ] `create-app/template/package.json.template:87` `"@open-mercato/storage-s3": "workspace:*"` violates the `{{PACKAGE_VERSION}}` convention (:541 drift test skips `@open-mercato/` keys so nothing catches it) — verify scaffold behavior and fix to `{{PACKAGE_VERSION}}`.
- [ ] ui `react-is ^19` dep under `react >=18` peer — version-skew; consider widening or documenting (safe today: recharts accepts ^19, react-is has no peers).
- [ ] onboarding jest: add `@open-mercato/cache` moduleNameMapper (core has one at `jest.config.cjs:20-21`) so the suite runs unbuilt like the rest.

## Branch stack (2026-11-07 recut)

The single mega-branch was split into a fork-internal stacked series (each layer green standalone). Adapted 2026-11-07 for archspec 0.6.45: L1 bumps the devDep 0.6.30→0.6.45 (scan model byte-identical to 0.6.30; 0.6.41-0.6.45 add report-only surfaces, preapproved in `.yarnrc.yml` to pass the npm age gate) and the computed-path jest-config idiom was dropped — the 42 `packages|apps/*/jest.config.cjs` keep their literal `require('../../jest.config.base.cjs')` (the trick was a resolution no-op and it hid those files from the generator's tool-config exclusion rule). L5's spec is regenerated with the adapted generator on the healthy-link tree (superset of the original exclusions, 296 entries, all re-discovered by the classifier):

| Layer | Branch | Content |
|---|---|---|
| 1 | `chore/archspec-1-tooling-audit` | archspec devDep at 0.6.45 (+ preapproval), generator/diagram helpers, ARCHITECTURE_AUDIT.md (no spec/guard yet — keeps CI green) |
| 2 | `refactor/archspec-2-ai-contracts-to-core` | ai-assistant contract cluster → `core/src/lib/ai` + index re-exports + consumer/test moves (audit F2/F3) |
| 3 | `refactor/archspec-3-cache-types-to-shared` | CacheStrategy types → shared + cache type-only shim + doc-pin test (F2) |
| 4 | `refactor/archspec-4-ui-families-cycles` | dictionary/audit UI families → `ui/src/backend`, core shims, field-registrar extraction, 12 file cycles broken (F3) |
| 5 | `fix/archspec-5-manifests-spec-guard` | manifest reallocation, peer optionals, react-is, spec + guard + CI wiring (F1/F4/F6) — verify green |

Follow-up Phases 1-6 stack on top of layer 5 as `fix/...` branches, each its own PR.
Known environment caveats on the current hoisted/unbuilt tree (identical on every layer incl. L5): 1 ai-assistant registry test, 7 ui AiChat suites (`@open-mercato/ai-assistant/.../agent-transport` deep import), shared's 14 env-failing suites, warranty `@open-mercato/events/bus` — all predate this stack.

## Done criteria

- `archspec verify` exit 0 on pristine unbuilt tree; spec regen byte-deterministic.
- `grep -L '@deprecated'` over Phase-1 shim list → empty.
- `rg "@open-mercato/cache" packages/shared/src` → empty; `rg "@open-mercato/core" packages/ui/src --glob '!**/__integration__/**'` → empty.
- No package marks a peer `optional` while holding a static value import of it (spot-check: `bootstrap.ts` ↔ search, `search/src/queue/*` ↔ queue); every runtime `@open-mercato` import's package sits in `dependencies`/required peers, never devDeps.
- `registry.generated.ts` either generator-emitted or reclassified; no hand-edit path left under the "generated" label.
- Spec with Migration & BC section + UPGRADE_NOTES entry exist; audit F4/F6 wording corrected; all touched suites green.
