// Repo-root tooling is loaded via a computed specifier: the root is not a
// dependency target for the architecture graph (see architecture.spec.toml).
const { watch } = await import(new URL('../../scripts/watch.mjs', import.meta.url).href)
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
watch(__dirname)
