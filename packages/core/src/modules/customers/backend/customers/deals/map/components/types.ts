import type { FilterOptionTone } from '@open-mercato/shared/lib/query/advanced-filter'

export type MapCenter = {
  latitude: number
  longitude: number
}

export type DealsMapCanvasDeal = {
  id: string
  latitude: number
  longitude: number
  tone: FilterOptionTone | null
}

export type DealsMapLegendStage = {
  id: string
  label: string
  tone: FilterOptionTone | null
}

export type DealsMapPreview = {
  id: string
  title: string
  companyLabel: string | null
  locationLine: string | null
  valueAmount: number | null
  valueCurrency: string | null
  probability: number | null
  expectedCloseAt: string | null
  stageLabel: string | null
  stageTone: FilterOptionTone | null
  ownerName: string | null
}

export type DealsMapCanvasProps = {
  deals: DealsMapCanvasDeal[]
  legendStages: DealsMapLegendStage[]
  preview: DealsMapPreview | null
  selectedDealId: string | null
  onSelect: (dealId: string | null) => void
  onCenterChange: (center: MapCenter) => void
  className?: string
}

export type StageMeta = { label: string; tone: FilterOptionTone }

export type MapDealLocation = {
  latitude: number
  longitude: number
  city: string | null
  region: string | null
  country: string | null
}

export type MapDeal = {
  id: string
  title: string
  status: string | null
  pipelineId: string | null
  pipelineStageId: string | null
  valueAmount: number | null
  valueCurrency: string | null
  probability: number | null
  expectedCloseAt: string | null
  ownerUserId: string | null
  companyLabel: string | null
  location: MapDealLocation | null
}
