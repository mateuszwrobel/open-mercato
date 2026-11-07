import type { AiToolDefinition } from '@open-mercato/core/lib/ai/types'
import timeTrackingAiTools from './ai-tools/time-tracking-pack'

/**
 * EP-49. The module's AI tool registry.
 *
 * The generator discovers `ai-tools.ts` at the module root only, so a pack living
 * in `ai-tools/` reaches the runtime through this aggregator — the customers
 * idiom.
 */
export const aiTools: AiToolDefinition[] = [...timeTrackingAiTools]

export default aiTools
