// Repo-root tooling is loaded via a computed specifier: the root is not a
// dependency target for the architecture graph (see architecture.spec.toml).
const { createStrykerConfig } = await import(new URL('../../scripts/stryker/createConfig.mjs', import.meta.url).href)

export default createStrykerConfig({ packageName: 'shared' })
