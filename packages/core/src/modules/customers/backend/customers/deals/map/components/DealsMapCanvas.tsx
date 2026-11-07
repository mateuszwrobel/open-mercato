"use client"

import * as React from 'react'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import type { DealsMapCanvasProps } from './types'

export type {
  DealsMapCanvasDeal,
  DealsMapCanvasProps,
  DealsMapLegendStage,
  DealsMapPreview,
  MapCenter,
} from './types'

type DealsMapCanvasComponent = (props: DealsMapCanvasProps) => React.ReactElement

/**
 * Lazy shell around the Leaflet implementation. Leaflet touches `window` at import time and ships
 * its own CSS, so the impl chunk (JS + stylesheets) is imported client-side only — on first mount,
 * inside an effect — which keeps it out of SSR while rendering a prop-sized placeholder until it
 * resolves. A single dynamic `import()` drives both the lazy load and the fallback.
 */
export function DealsMapCanvas(props: DealsMapCanvasProps): React.ReactElement {
  const [Impl, setImpl] = React.useState<DealsMapCanvasComponent | null>(null)
  React.useEffect(() => {
    let cancelled = false
    void import('./DealsMapCanvasImpl').then((mod) => {
      if (!cancelled) setImpl(() => mod.default)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (!Impl) {
    return (
      <div className={`flex items-center justify-center bg-muted/30 ${props.className ?? ''}`.trim()}>
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    )
  }
  return <Impl {...props} />
}

export default DealsMapCanvas
