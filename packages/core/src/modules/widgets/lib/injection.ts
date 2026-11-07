// Re-export from shared for backward compatibility
// New code should import directly from @open-mercato/shared/modules/widgets/injection-loader
import { publishCoreFieldRegistrations } from '../../../lib/fields/registrations'

export {
  registerCoreInjectionWidgets,
  getCoreInjectionWidgets,
  registerCoreInjectionTables,
  getCoreInjectionTables,
  registerEnabledModuleIds,
  getEnabledModuleIds,
  invalidateInjectionWidgetCache,
  loadAllInjectionWidgets,
  loadInjectionDataWidgetById,
  loadInjectionDataWidgetsForSpot,
  loadInjectionWidgetById,
  loadInjectionWidgetsForSpot,
  type LoadedInjectionDataWidget,
  type LoadedInjectionWidget,
} from '@open-mercato/shared/modules/widgets/injection-loader'

// This module is the core client entry that every app profile's bootstrap
// loads (directly or via the shared bootstrap factory), so it publishes the
// core field registrars through the package-level glue in
// `src/lib/fields/registrations` before any CrudForm can mount.
publishCoreFieldRegistrations()

