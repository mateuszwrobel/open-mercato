import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
// Opaque specifier probe: archspec resolves computed-path idioms whose parts
// are literals; a runtime-joined list defeats constant folding entirely.
const { buildPackage } = await import(new URL(['..', '..', 'scripts', 'build-package.mjs'].join('/'), import.meta.url).href)

const packageDir = dirname(fileURLToPath(import.meta.url))

await buildPackage(packageDir, { name: 'tillio' })
