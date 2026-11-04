import type { ComponentType } from 'react'
import type {
  MessageActionsProps,
  MessageContentProps,
  MessageListItemProps,
  ObjectPreviewProps,
  ObjectDetailProps,
} from '@open-mercato/shared/modules/messages/types'

export type MessageUiComponentRegistry = {
  listItemComponents: Record<string, ComponentType<MessageListItemProps>>
  contentComponents: Record<string, ComponentType<MessageContentProps>>
  actionsComponents: Record<string, ComponentType<MessageActionsProps>>
  objectDetailComponents: Record<string, ComponentType<ObjectDetailProps>>
  objectPreviewComponents: Record<string, ComponentType<ObjectPreviewProps>>
}

export type MessageUiComponentDefaults = {
  objectDetail?: ComponentType<ObjectDetailProps> | null
  objectPreview?: ComponentType<ObjectPreviewProps> | null
}

const GLOBAL_MESSAGE_TYPE_UI_KEY = '__openMercatoMessageTypeUiRegistry__'

type MessageTypeUiState = {
  listItemComponents: Map<string, ComponentType<MessageListItemProps>>
  contentComponents: Map<string, ComponentType<MessageContentProps>>
  actionsComponents: Map<string, ComponentType<MessageActionsProps>>
  objectDetailComponents: Map<string, ComponentType<ObjectDetailProps>>
  objectPreviewComponents: Map<string, ComponentType<ObjectPreviewProps>>
  defaults: MessageUiComponentDefaults
}

function createState(): MessageTypeUiState {
  return {
    listItemComponents: new Map(),
    contentComponents: new Map(),
    actionsComponents: new Map(),
    objectDetailComponents: new Map(),
    objectPreviewComponents: new Map(),
    defaults: {},
  }
}

function readState(): MessageTypeUiState {
  try {
    const value = (globalThis as Record<string, unknown>)[GLOBAL_MESSAGE_TYPE_UI_KEY]
    if (value && typeof value === 'object') return value as MessageTypeUiState
  } catch {
    // ignore global access failures
  }
  const state = createState()
  try {
    ;(globalThis as Record<string, unknown>)[GLOBAL_MESSAGE_TYPE_UI_KEY] = state
  } catch {
    // ignore global assignment failures
  }
  return state
}

function getObjectDetailComponentKey(entityModule: string, entityType: string): string {
  return `${entityModule}:${entityType}`
}

export function configureMessageUiComponentRegistry(registry: MessageUiComponentRegistry): void {
  const state = readState()
  state.listItemComponents.clear()
  state.contentComponents.clear()
  state.actionsComponents.clear()
  state.objectDetailComponents.clear()
  state.objectPreviewComponents.clear()

  for (const [key, component] of Object.entries(registry.listItemComponents ?? {})) {
    state.listItemComponents.set(key, component)
  }
  for (const [key, component] of Object.entries(registry.contentComponents ?? {})) {
    state.contentComponents.set(key, component)
  }
  for (const [key, component] of Object.entries(registry.actionsComponents ?? {})) {
    state.actionsComponents.set(key, component)
  }
  for (const [key, component] of Object.entries(registry.objectDetailComponents ?? {})) {
    state.objectDetailComponents.set(key, component)
  }
  for (const [key, component] of Object.entries(registry.objectPreviewComponents ?? {})) {
    state.objectPreviewComponents.set(key, component)
  }
}

export function getMessageUiComponentRegistry(): MessageUiComponentRegistry {
  const state = readState()
  return {
    listItemComponents: Object.fromEntries(state.listItemComponents.entries()),
    contentComponents: Object.fromEntries(state.contentComponents.entries()),
    actionsComponents: Object.fromEntries(state.actionsComponents.entries()),
    objectDetailComponents: Object.fromEntries(state.objectDetailComponents.entries()),
    objectPreviewComponents: Object.fromEntries(state.objectPreviewComponents.entries()),
  }
}

/**
 * Registers fallback components for object detail/preview lookups. Owning
 * packages call this once at module load so the fallback used by
 * `getMessageUiComponentForObjectDetail`/`...Preview` matches their components;
 * consumers that never load those packages simply get `null` fallbacks.
 */
export function setMessageUiComponentDefaults(defaults: MessageUiComponentDefaults): void {
  const state = readState()
  if (defaults.objectDetail !== undefined) state.defaults.objectDetail = defaults.objectDetail
  if (defaults.objectPreview !== undefined) state.defaults.objectPreview = defaults.objectPreview
}

export function getMessageUiComponentForListItem(
  key: string | null | undefined,
): ComponentType<MessageListItemProps> | null {
  if (!key) return null
  return readState().listItemComponents.get(key) ?? null
}

export function getMessageUiComponentForContent(
  key: string | null | undefined,
): ComponentType<MessageContentProps> | null {
  if (!key) return null
  return readState().contentComponents.get(key) ?? null
}

export function getMessageUiComponentForActions(
  key: string | null | undefined,
): ComponentType<MessageActionsProps> | null {
  if (!key) return null
  return readState().actionsComponents.get(key) ?? null
}

export function getMessageUiComponentForObjectDetail(
  entityModule: string | null | undefined,
  entityType: string | null | undefined,
): ComponentType<ObjectDetailProps> | null {
  const state = readState()
  if (!entityModule || !entityType) return state.defaults.objectDetail ?? null
  const key = getObjectDetailComponentKey(entityModule, entityType)
  return state.objectDetailComponents.get(key) ?? state.defaults.objectDetail ?? null
}

export function getMessageUiComponentForObjectPreview(
  entityModule: string | null | undefined,
  entityType: string | null | undefined,
): ComponentType<ObjectPreviewProps> | null {
  const state = readState()
  if (!entityModule || !entityType) {
    return state.objectPreviewComponents.get('messages:default') ?? state.defaults.objectPreview ?? null
  }
  const key = getObjectDetailComponentKey(entityModule, entityType)
  const component = state.objectPreviewComponents.get(key)
  return component ?? state.objectPreviewComponents.get('messages:default') ?? state.defaults.objectPreview ?? null
}
