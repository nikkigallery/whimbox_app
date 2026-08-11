import { useCallback, useEffect, useState } from 'react'
import { LogIn, LogOut, MapPinned, PlayCircle, RefreshCw, Square, UserRound } from 'lucide-react'
import { toast } from 'sonner'

import { ScrollCenterLayout } from 'renderer/components/scroll-center-layout'
import { SettingsPageLayout } from 'renderer/components/settings-page-layout'
import { Button } from 'renderer/components/ui/button'
import type {
  GameWindowBounds,
  MapMaskLabelsResponse,
  MapMaskState,
  MapMaskUserStatus,
} from 'renderer/types/map-mask'

export function MapMaskPage() {
  const [state, setState] = useState<MapMaskState | null>(null)
  const [labelCount, setLabelCount] = useState(0)
  const [bounds, setBounds] = useState<GameWindowBounds | null>(null)
  const [loading, setLoading] = useState(false)
  const [userStatus, setUserStatus] = useState<MapMaskUserStatus | null>(null)
  const [loginBusy, setLoginBusy] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [nextState, labels, nextBounds, nextUserStatus] = await Promise.all([
        window.App.rpc.request('map_mask.get_state') as Promise<MapMaskState>,
        window.App.rpc.request('map_mask.get_labels') as Promise<MapMaskLabelsResponse>,
        window.App.mapMaskOverlay?.getBounds(),
        window.App.rpc.request('map_mask.get_user_status') as Promise<MapMaskUserStatus>,
      ])
      setState(nextState)
      setLabelCount(labels.labels.length)
      setBounds(nextBounds ?? null)
      setUserStatus(nextUserStatus)
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

  const handleLogin = async () => {
    setLoginBusy(true)
    try {
      let next = await window.App.rpc.request(
        'map_mask.start_pearpal_login',
      ) as MapMaskUserStatus
      setUserStatus(next)
      while (next.auth_state === 'opening-login' || next.auth_state === 'loading-user-state') {
        await new Promise((resolve) => setTimeout(resolve, 500))
        next = await window.App.rpc.request(
          'map_mask.get_user_status',
        ) as MapMaskUserStatus
        setUserStatus(next)
      }
      if (next.authenticated) {
        toast.success('PearPal user state loaded')
      } else if (next.auth_state === 'error') {
        toast.error(next.auth_error || 'PearPal login failed')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'PearPal login failed')
    } finally {
      setLoginBusy(false)
      await refresh()
    }
  }

  const handleDisconnect = async () => {
    try {
      const next = await window.App.rpc.request(
        'map_mask.disconnect_pearpal_user',
      ) as MapMaskUserStatus
      setUserStatus(next)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Disconnect failed')
    }
  }

  const handleToggleAwarded = async () => {
    try {
      const next = await window.App.rpc.request(
        'map_mask.set_hide_awarded',
        { hide_awarded: !userStatus?.hide_awarded },
      ) as MapMaskUserStatus
      setUserStatus(next)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Update filter failed')
    }
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
          <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm shadow-sm md:col-span-2 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100">
                <UserRound className="size-4 text-violet-500" />
                PearPal user
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void handleLogin()}
                  disabled={loginBusy}
                >
                  <LogIn className="size-4" />
                  {loginBusy
                    ? 'Waiting for login...'
                    : userStatus?.authenticated
                      ? 'Refresh user state'
                      : 'Login'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void handleToggleAwarded()}
                  disabled={!userStatus?.authenticated || loginBusy}
                >
                  Hide collected: {userStatus?.hide_awarded ? 'on' : 'off'}
                </Button>
                {userStatus?.authenticated ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void handleDisconnect()}
                    disabled={loginBusy}
                  >
                    <LogOut className="size-4" />
                    Disconnect
                  </Button>
                ) : null}
              </div>
            </div>
            <dl className="grid gap-2 text-xs text-slate-500 sm:grid-cols-2 dark:text-slate-400">
              <Row label="status" value={userStatus?.auth_state ?? 'pending'} />
              <Row label="account" value={userStatus?.openid_masked || 'anonymous'} />
              <Row
                label="stars collected"
                value={String(userStatus?.awarded_star_count ?? 0)}
              />
              <Row
                label="dewdrops collected"
                value={String(userStatus?.awarded_dewdrop_count ?? 0)}
              />
              <Row
                label="boxes collected"
                value={String(userStatus?.awarded_box_count ?? 0)}
              />
              <Row
                label="matched in current data"
                value={
                  userStatus
                    ? `${userStatus.matched_awarded_star_count} stars / ${userStatus.matched_awarded_dewdrop_count} dewdrops / ${userStatus.matched_awarded_box_count} boxes`
                    : 'pending'
                }
              />
              <Row label="error" value={userStatus?.auth_error || 'none'} />
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
