import { registerFieldRegistrationsLoader } from '@open-mercato/shared/lib/fields/registrations'

/**
 * Publish lazy loaders for core module field registrars (files that call
 * `FieldRegistry.register` on import). CrudForm's generated loader in
 * `@open-mercato/ui/backend/fields/registry.generated` runs whatever has been
 * published through the shared registry. This enumeration is package-level
 * glue, so it lives in `src/lib` rather than inside any single module — the
 * client bootstrap entry in `modules/widgets/lib/injection` calls it once,
 * which keeps publication independent of CrudForm mount order while the
 * registrars stay lazy.
 */
export function publishCoreFieldRegistrations(): void {
  registerFieldRegistrationsLoader(() => import('../../modules/attachments/fields/attachment'))
  registerFieldRegistrationsLoader(() => import('../../modules/dictionaries/fields/dictionary'))
}
