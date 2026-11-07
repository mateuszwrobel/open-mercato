export type Translator = (
  key: string,
  fallbackOrParams?: string | Record<string, string | number>,
  params?: Record<string, string | number>,
) => string

export type ProductSnapshot = {
  name?: string
  sku?: string
}

export type CompanySnapshot = {
  displayName?: string
}

export type OrderSnapshot = {
  orderNumber?: string | null
}

export type PlotMapPreviewProps = {
  features: unknown[]
  height?: number
}

export type PickerOption<Snapshot extends Record<string, unknown>> = {
  value: string
  label: string
  subtitle?: string | null
  snapshot?: Snapshot | null
  unavailable?: boolean
}

export type LookupSelectFieldProps<Snapshot extends Record<string, unknown>> = {
  id: string
  value?: string | null
  onChange: (value: string | undefined) => void
  onSnapshot?: (snapshot: Snapshot | null) => void
  placeholder: string
  emptyLabel?: string
  loadError: string
  disabled?: boolean
  loadOptions: (search: string) => Promise<PickerOption<Snapshot>[]>
  loadSelectedOption?: (id: string) => Promise<PickerOption<Snapshot> | null>
}
