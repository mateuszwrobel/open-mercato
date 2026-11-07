export type BarChartDataItem = Record<string, string | number | null | undefined>

export type BarChartProps = {
  title?: string
  data: BarChartDataItem[]
  index: string
  categories: string[]
  loading?: boolean
  error?: string | null
  colors?: string[]
  layout?: 'vertical' | 'horizontal'
  valueFormatter?: (value: number) => string
  showLegend?: boolean
  showGridLines?: boolean
  className?: string
  emptyMessage?: string
  categoryLabels?: Record<string, string>
}

export type LineChartDataItem = Record<string, string | number | null | undefined>

export type LineChartProps = {
  title?: string
  data: LineChartDataItem[]
  index: string
  categories: string[]
  loading?: boolean
  error?: string | null
  colors?: string[]
  showArea?: boolean
  valueFormatter?: (value: number) => string
  showLegend?: boolean
  showGridLines?: boolean
  curveType?: 'linear' | 'natural' | 'monotone' | 'step'
  connectNulls?: boolean
  className?: string
  emptyMessage?: string
  categoryLabels?: Record<string, string>
}

export type PieChartDataItem = {
  name: string
  value: number
}

export type PieChartProps = {
  title?: string
  data: PieChartDataItem[]
  loading?: boolean
  error?: string | null
  colors?: string[]
  variant?: 'pie' | 'donut'
  valueFormatter?: (value: number) => string
  showLabel?: boolean
  showTooltip?: boolean
  className?: string
  emptyMessage?: string
}
