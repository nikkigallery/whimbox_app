import { useCallback, useEffect, useState } from 'react'
import { MapPinned, PlayCircle, RefreshCw, Square } from 'lucide-react'
import { toast } from 'sonner'

import { ScrollCenterLayout } from 'renderer/components/scroll-center-layout'
import { SettingsPageLayout } from 'renderer/components/settings-page-layout'
import { Button } from 'renderer/components/ui/button'
import type {
  GameWindowBounds,
  MapMaskLabelsResponse,
  MapMaskState,
} from 'renderer/types/map-mask'

export function MapMaskPage() {
  const [state, setState] = useState<MapMaskState | null>(null)
  const [labelCount, setLabelCount] = useState(0)
  const [bounds, setBounds] = useState<GameWindowBounds | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [nextState, labels, nextBounds] = await Promise.all([
        window.App.rpc.request('map_mask.get_state') as Promise<MapMaskState>,
        window.App.rpc.request('map_mask.get_labels') as Promise<MapMaskLabelsResponse>,
        window.App.mapMaskOverlay?.getBounds(),
      ])
      setState(nextState)
      setLabelCount(labels.labels.length)
      setBounds(nextBounds ?? null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Map mask RPC failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleOpen = async () => {
    try {
      await window.App.mapMaskOverlay?.show()
      await refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Open map mask failed')
    }
  }

  const handleClose = async () => {
    await window.App.mapMaskOverlay?.hide()
  }

  return (
    <ScrollCenterLayout
      scrollOuter={false}
      innerClassName="flex flex-1 flex-col min-h-0 gap-4 px-10 py-8"
    >
      <SettingsPageLayout
        className="flex-1 min-h-0"
        title="Map Mask"
        description="Sample-data overlay for the local map mask MVP."
        actions={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={handleOpen}
              disabled={loading}
              className="rounded-xl bg-pink-400 text-white shadow-sm hover:bg-pink-500 dark:bg-pink-500 dark:hover:bg-pink-400"
            >
              <PlayCircle className="size-4" />
              Open overlay
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={loading}
              className="rounded-xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              <Square className="size-4" />
              Hide overlay
            </Button>
          </div>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100">
                <MapPinned className="size-4 text-pink-400" />
                Backend state
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => void refresh()}
                disabled={loading}
              >
                <RefreshCw className={loading ? 'size-4 animate-spin' : 'size-4'} />
              </Button>
            </div>
            <dl className="space-y-2 text-xs text-slate-500 dark:text-slate-400">
              <Row label="enabled" value={state ? String(state.enabled) : 'pending'} />
              <Row label="bigmap" value={state ? String(state.is_bigmap_open) : 'pending'} />
              <Row label="provider" value={state?.provider ?? 'pending'} />
              <Row label="selected" value={String(state?.selected_label_ids.length ?? 0)} />
              <Row label="labels" value={String(labelCount)} />
              <Row
                label="viewport"
                value={state?.has_valid_viewport ? state.viewport?.map_name ?? 'valid' : 'invalid'}
              />
              <Row label="viewport mode" value={state?.viewport_mode ?? 'pending'} />
              <Row label="viewport source" value={state?.viewport_source ?? 'pending'} />
              <Row label="viewport fallback" value={state ? String(state.viewport_fallback_used) : 'pending'} />
              <Row label="viewport error" value={state?.viewport_calibration_error || 'none'} />
              <Row label="detection" value={state?.detection_source ?? 'pending'} />
              <Row
                label="raw/stable"
                value={
                  state
                    ? `${String(state.raw_is_bigmap_open)} / ${String(state.stable_is_bigmap_open)}`
                    : 'pending'
                }
              />
              <Row
                label="counts"
                value={
                  state
                    ? `${state.consecutive_open_count}/${state.consecutive_closed_count}`
                    : 'pending'
                }
              />
              <Row label="detect error" value={state?.detection_error || 'none'} />
            </dl>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3 flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100">
              <MapPinned className="size-4 text-cyan-500" />
              Window tracker
            </div>
            <dl className="space-y-2 text-xs text-slate-500 dark:text-slate-400">
              <Row label="source" value={bounds?.source ?? 'pending'} />
              <Row label="found" value={bounds ? String(bounds.isGameWindowFound) : 'pending'} />
              <Row
                label="bounds"
                value={
                  bounds
                    ? `${bounds.width}x${bounds.height} at ${bounds.x},${bounds.y}`
                    : 'pending'
                }
              />
            </dl>
          </section>
        </div>
      </SettingsPageLayout>
    </ScrollCenterLayout>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-slate-400">{label}</dt>
      <dd className="min-w-0 truncate text-right text-slate-700 dark:text-slate-200">{value}</dd>
    </div>
  )
}
