import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
// Repo-root tooling is loaded via a computed specifier: the root is not a
// dependency target for the architecture graph (see architecture.spec.toml).
const { buildPackage } = await import(new URL('../../scripts/build-package.mjs', import.meta.url).href)

const packageDir = dirname(fileURLToPath(import.meta.url))

await buildPackage(packageDir, { name: 'channel-resend' })
