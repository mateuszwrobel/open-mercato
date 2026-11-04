import type { MessageObjectTypeDefinition } from '@open-mercato/shared/modules/messages/types'
import { createLogger } from '@open-mercato/shared/lib/logger'

const logger = createLogger('messages')

const GLOBAL_MESSAGE_OBJECT_TYPES_KEY = '__openMercatoMessageObjectTypes__'
const GLOBAL_MESSAGE_OBJECT_TYPE_DEFAULTS_KEY = '__openMercatoMessageObjectTypeDefaults__'

type MessageObjectTypeState = Map<string, MessageObjectTypeDefinition>

function getKey(module: string, entityType: string): string {
  return `${module}:${entityType}`
}

function readRegistry(): MessageObjectTypeState {
  try {
    const value = (globalThis as Record<string, unknown>)[GLOBAL_MESSAGE_OBJECT_TYPES_KEY]
    if (value instanceof Map) return value as MessageObjectTypeState
  } catch {
    // ignore global access failures
  }
  const registry = new Map<string, MessageObjectTypeDefinition>()
  try {
    ;(globalThis as Record<string, unknown>)[GLOBAL_MESSAGE_OBJECT_TYPES_KEY] = registry
  } catch {
    // ignore global assignment failures
  }
  return registry
}

function readDefaults(): MessageObjectTypeDefinition[] {
  try {
    const value = (globalThis as Record<string, unknown>)[GLOBAL_MESSAGE_OBJECT_TYPE_DEFAULTS_KEY]
    return Array.isArray(value) ? (value as MessageObjectTypeDefinition[]) : []
  } catch {
    return []
  }
}

/**
 * Registers fallback object types applied lazily when the registry is still
 * empty on first read. Owning packages publish their built-in definitions here
 * so package-agnostic consumers can resolve them without importing the owning
 * package directly.
 */
export function setMessageObjectTypeRegistryDefaults(types: MessageObjectTypeDefinition[]): void {
  try {
    ;(globalThis as Record<string, unknown>)[GLOBAL_MESSAGE_OBJECT_TYPE_DEFAULTS_KEY] = types
  } catch {
    // ignore global assignment failures
  }
}

export type RegisterMessageObjectTypesOptions = {
  replace?: boolean
}

function ensureDefaults(): void {
  const registry = readRegistry()
  if (registry.size > 0) return
  const defaults = readDefaults()
  if (defaults.length === 0) return
  registerMessageObjectTypes(defaults)
}

export function registerMessageObjectTypes(
  types: MessageObjectTypeDefinition[],
  options: RegisterMessageObjectTypesOptions = {},
): void {
  const registry = readRegistry()
  if (options.replace) {
    registry.clear()
  }
  for (const type of types) {
    const key = getKey(type.module, type.entityType)
    if (registry.has(key)) {
      logger.warn('Message object type already registered, overwriting', { key })
    }
    registry.set(key, type)
  }
}

export function getMessageObjectType(module: string, entityType: string): MessageObjectTypeDefinition | undefined {
  ensureDefaults()
  return readRegistry().get(getKey(module, entityType))
}

export function isMessageObjectTypeAllowedForMessageType(
  objectType: MessageObjectTypeDefinition,
  messageType: string,
): boolean {
  if (!messageType || !messageType.trim()) return true
  const allowed = objectType.messageTypes
  if (!Array.isArray(allowed) || allowed.length === 0) return true
  return allowed.includes(messageType)
}

export function getMessageObjectTypesForMessageType(messageType: string): MessageObjectTypeDefinition[] {
  ensureDefaults()
  return Array.from(readRegistry().values()).filter((objectType) =>
    isMessageObjectTypeAllowedForMessageType(objectType, messageType),
  )
}

export function getAllMessageObjectTypes(): MessageObjectTypeDefinition[] {
  ensureDefaults()
  return Array.from(readRegistry().values())
}
