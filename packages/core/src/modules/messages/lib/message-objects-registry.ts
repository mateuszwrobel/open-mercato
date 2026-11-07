import defaultTypes from '../message-objects'
import { setMessageObjectTypeRegistryDefaults } from '@open-mercato/shared/modules/messages/object-type-registry'

setMessageObjectTypeRegistryDefaults(defaultTypes)

export * from '@open-mercato/shared/modules/messages/object-type-registry'
