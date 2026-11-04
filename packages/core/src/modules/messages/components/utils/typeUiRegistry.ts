"use client"

import { setMessageUiComponentDefaults } from '@open-mercato/shared/modules/messages/type-ui-registry'
import { MessageRecordObjectDetail } from '../defaults/MessageRecordObjectDetail'
import { MessageRecordObjectPreview } from '../defaults/MessageRecordObjectPreview'

setMessageUiComponentDefaults({
  objectDetail: MessageRecordObjectDetail,
  objectPreview: MessageRecordObjectPreview,
})

export * from '@open-mercato/shared/modules/messages/type-ui-registry'
