import {
  ArrowUp, ArrowUpLeft, ArrowUpRight, CornerUpLeft, CornerUpRight,
  Compass, MapPin, RotateCcw, RotateCw,
} from 'lucide-react'

import type { SceneTarget } from 'renderer/types/map-mask'

const compassDirections = ['北', '东北', '东', '东南', '南', '西南', '西', '西北']

function turnInstruction(target: SceneTarget) {
  if (target.distance_m <= 2) return { Icon: MapPin, text: '目标在附近' }
  if (target.turn_deg == null) {
    const bearing = target.bearing_deg
    if (bearing == null || !Number.isFinite(bearing)) return { Icon: Compass, text: '正在确认方向' }
    const direction = compassDirections[Math.round(bearing / 45) % 8]
    return { Icon: Compass, text: `目标在${direction}方` }
  }
  const angle = Math.abs(target.turn_deg)
  const left = target.turn_deg < 0
  if (angle <= 15) return { Icon: ArrowUp, text: '直行' }
  if (angle <= 45) {
    return left ? { Icon: ArrowUpLeft, text: '向左前方' } : { Icon: ArrowUpRight, text: '向右前方' }
  }
  if (angle < 145) {
    return left ? { Icon: CornerUpLeft, text: '向左转' } : { Icon: CornerUpRight, text: '向右转' }
  }
  return { Icon: left ? RotateCcw : RotateCw, text: '掉头' }
}

export function SceneGuidance({ target, label }: { target: SceneTarget; label?: string }) {
  const { Icon, text } = turnInstruction(target)
  return (
    <div className="map-mask-hud pointer-events-none absolute left-1/2 top-[12%] flex max-w-[60vw] -translate-x-1/2 items-center gap-2.5 px-5 py-1.5 text-white">
      <Icon aria-hidden="true" className="size-9 shrink-0 text-emerald-200" strokeWidth={2.6} />
      <div className="min-w-0">
        <div className="text-lg leading-tight font-bold">{text}</div>
        <div className="mt-0.5 truncate text-sm text-slate-100">
          {label || target.name} · 约 {target.distance_m} 米
          {target.progress_cached && ' · 上次同步'}
        </div>
      </div>
    </div>
  )
}
