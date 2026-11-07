"use client"

import * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { LookupSelect } from '@open-mercato/ui/backend/inputs'
import type { LookupSelectFieldProps, PickerOption } from './types'

export const PICKER_PAGE_SIZE = 20

export function LookupSelectField<Snapshot extends Record<string, unknown>>({
  id,
  value,
  onChange,
  onSnapshot,
  placeholder,
  loadError,
  disabled,
  loadOptions,
  loadSelectedOption,
}: LookupSelectFieldProps<Snapshot>) {
  const translate = useT()
  const selectedValue = typeof value === 'string' && value.length > 0 ? value : null
  const [selectedOption, setSelectedOption] = React.useState<PickerOption<Snapshot> | null>(null)
  const knownOptionsRef = React.useRef<Map<string, PickerOption<Snapshot>>>(new Map())

  React.useEffect(() => {
    if (!selectedValue) {
      setSelectedOption(null)
      return
    }
    if (selectedOption?.value === selectedValue) return
    const known = knownOptionsRef.current.get(selectedValue)
    if (known) {
      setSelectedOption(known)
      return
    }
    let cancelled = false
    const markUnavailable = () => {
      if (!cancelled) {
        setSelectedOption({
          value: selectedValue,
          label: translate('eudr.common.recordUnavailable'),
          unavailable: true,
        })
      }
    }
    if (!loadSelectedOption) {
      markUnavailable()
      return
    }
    loadSelectedOption(selectedValue)
      .then((resolved) => {
        if (cancelled) return
        if (resolved) {
          knownOptionsRef.current.set(resolved.value, resolved)
          setSelectedOption(resolved)
        } else {
          markUnavailable()
        }
      })
      .catch(markUnavailable)
    return () => {
      cancelled = true
    }
  }, [loadSelectedOption, selectedOption, selectedValue, translate])

  // A snapshot is a denormalization captured when the user picks a record, so resolving the
  // value an edit form was hydrated with must not re-emit it. Doing so overwrites the stored
  // snapshot with a freshly fetched one, which makes an untouched CrudForm look dirty and
  // raises the "You have unsaved changes" prompt on the way out.
  const hydratedValueRef = React.useRef<string | null>(selectedValue)

  React.useEffect(() => {
    if (!onSnapshot || !selectedOption || selectedOption.unavailable) return
    if (hydratedValueRef.current === selectedOption.value) return
    hydratedValueRef.current = null
    onSnapshot(selectedOption.snapshot ?? null)
  }, [onSnapshot, selectedOption])

  const selectedOptionRef = React.useRef(selectedOption)
  React.useEffect(() => {
    selectedOptionRef.current = selectedOption
  }, [selectedOption])

  const setQueryRef = React.useRef<((value: string) => void) | null>(null)

  const fetchItems = React.useCallback(async (query: string) => {
    let options: Array<PickerOption<Snapshot>> = []
    try {
      options = await loadOptions(query)
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : loadError
      flash(message, 'error')
      options = []
    }
    for (const option of options) knownOptionsRef.current.set(option.value, option)
    const selected = selectedOptionRef.current
    const merged = selected && !options.some((option) => option.value === selected.value)
      ? [selected, ...options]
      : options
    return merged.map((option) => ({
      id: option.value,
      title: option.label,
      subtitle: option.subtitle ?? undefined,
    }))
  }, [loadError, loadOptions])

  return (
    <div id={id} className="space-y-2">
      {selectedValue ? (
        <p className="text-sm text-foreground">
          <span className="font-medium">{selectedOption?.label ?? ''}</span>
          {selectedOption?.subtitle ? (
            <span className="text-muted-foreground"> — {selectedOption.subtitle}</span>
          ) : null}
        </p>
      ) : null}
      <LookupSelect
        value={selectedValue}
        disabled={disabled}
        searchPlaceholder={placeholder}
        fetchItems={fetchItems}
        onReady={(controls) => { setQueryRef.current = controls.setQuery }}
        onChange={(nextValue) => {
          if (!nextValue) {
            onChange(undefined)
            onSnapshot?.(null)
            setSelectedOption(null)
            return
          }
          onChange(nextValue)
          const nextOption = knownOptionsRef.current.get(nextValue) ?? null
          setSelectedOption(nextOption)
          onSnapshot?.(nextOption?.snapshot ?? null)
          // Clearing the query drops LookupSelect back below its minQuery, which
          // collapses the result panel — otherwise it stays open over the form.
          setQueryRef.current?.('')
        }}
      />
    </div>
  )
}
