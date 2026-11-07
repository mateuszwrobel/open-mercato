export type FieldRegistrationsLoader = () => Promise<unknown>

const GLOBAL_FIELD_REGISTRATION_LOADERS_KEY = '__openMercatoFieldRegistrationsLoaders__'

type FieldRegistrationsState = {
  loaders: FieldRegistrationsLoader[]
  loaded: Set<FieldRegistrationsLoader>
  flushed: boolean
}

function createState(): FieldRegistrationsState {
  return { loaders: [], loaded: new Set(), flushed: false }
}

function readState(): FieldRegistrationsState {
  try {
    const value = (globalThis as Record<string, unknown>)[GLOBAL_FIELD_REGISTRATION_LOADERS_KEY]
    if (value && typeof value === 'object') return value as FieldRegistrationsState
  } catch {
    // ignore global access failures
  }
  const state = createState()
  try {
    ;(globalThis as Record<string, unknown>)[GLOBAL_FIELD_REGISTRATION_LOADERS_KEY] = state
  } catch {
    // ignore global assignment failures
  }
  return state
}

async function runLoader(loader: FieldRegistrationsLoader): Promise<void> {
  if (readState().loaded.has(loader)) return
  readState().loaded.add(loader)
  try {
    await loader()
  } catch (err) {
    readState().loaded.delete(loader)
    throw err
  }
}

/**
 * Publishes a lazy loader for a package's generated field registrations
 * (modules that call `FieldRegistry.register` on import). Loaders run once;
 * a loader registered after the first flush runs immediately so registration
 * does not depend on which package loads first.
 */
export function registerFieldRegistrationsLoader(loader: FieldRegistrationsLoader): void {
  const state = readState()
  state.loaders.push(loader)
  if (state.flushed) void runLoader(loader).catch(() => {})
}

export function getFieldRegistrationsLoaders(): readonly FieldRegistrationsLoader[] {
  return readState().loaders
}

export async function runFieldRegistrations(): Promise<void> {
  const state = readState()
  state.flushed = true
  await Promise.all(state.loaders.map((loader) => runLoader(loader)))
}
