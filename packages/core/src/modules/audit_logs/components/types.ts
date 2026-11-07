export type ActionLogItem = {
  id: string
  commandId: string
  actionLabel: string | null
  executionState: string
  actorUserId: string | null
  actorUserName: string | null
  tenantId: string | null
  tenantName: string | null
  organizationId: string | null
  organizationName: string | null
  resourceKind: string | null
  resourceId: string | null
  undoToken: string | null
  createdAt: string
  updatedAt: string
  snapshotBefore?: unknown | null
  snapshotAfter?: unknown | null
  changes?: Record<string, unknown> | null
  context?: Record<string, unknown> | null
}
