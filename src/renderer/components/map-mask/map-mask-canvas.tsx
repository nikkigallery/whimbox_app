import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type {
  MapMaskLabel,
  MapMaskViewport,
  VisibleMapMaskPoint,
} from 'renderer/types/map-mask'

type CanvasPoint = {
  point: VisibleMapMaskPoint
  x: number
  y: number
}

type CanvasPointerEvent =
  | React.PointerEvent<HTMLCanvasElement>
  | React.MouseEvent<HTMLCanvasElement>

type MapMaskCanvasProps = {
  points: VisibleMapMaskPoint[]
  labels: MapMaskLabel[]
  viewport: MapMaskViewport | null
  enabled: boolean
  selectedPointId: string | null
  onPointHover: (
    point: VisibleMapMaskPoint | null,
    position: { x: number; y: number } | null,
  ) => void
  onPointClick: (
    point: VisibleMapMaskPoint,
    position: { x: number; y: number },
  ) => void
}

const markerColors = [
  '#ff6b8a',
  '#39c5bb',
  '#f5b84b',
  '#8b7cf6',
  '#5bc0eb',
  '#7bd88f',
]

function hashColor(value: string) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }
  return markerColors[hash % markerColors.length]
}

function markerGlyph(label?: MapMaskLabel) {
  const source = label?.name || label?.id || '?'
  return source.trim().slice(0, 1).toUpperCase() || '?'
}

function toCanvasPoint(
  point: VisibleMapMaskPoint,
): CanvasPoint {
  return { point, x: point.screen_x, y: point.screen_y }
}

function findHit(
  points: CanvasPoint[],
  x: number,
  y: number,
): CanvasPoint | null {
  let best: CanvasPoint | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (const item of points) {
    const dx = item.x - x
    const dy = item.y - y
    const distance = Math.sqrt(dx * dx + dy * dy)
    if (distance <= 18 && distance < bestDistance) {
      best = item
      bestDistance = distance
    }
  }
  return best
}

export function MapMaskCanvas({
  points,
  labels,
  enabled,
  selectedPointId,
  onPointHover,
  onPointClick,
}: MapMaskCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [size, setSize] = useState({ width: 1, height: 1 })

  const labelById = useMemo(() => {
    return new Map(labels.map((label) => [label.id, label]))
  }, [labels])

  const canvasPoints = useMemo(() => {
    return points.map((point) => toCanvasPoint(point))
  }, [points])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const updateSize = () => {
      const rect = canvas.getBoundingClientRect()
      setSize({
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height)),
      })
    }

    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ratio = Math.max(1, window.devicePixelRatio || 1)
    canvas.width = Math.round(size.width * ratio)
    canvas.height = Math.round(size.height * ratio)

    const context = canvas.getContext('2d')
    if (!context) return

    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0, 0, size.width, size.height)

    if (!enabled) return

    for (const item of canvasPoints) {
      const label = labelById.get(item.point.label_id)
      const color = hashColor(item.point.label_id)
      const selected = selectedPointId === item.point.id

      context.save()
      context.shadowColor = 'rgba(15, 23, 42, 0.45)'
      context.shadowBlur = selected ? 16 : 10
      context.beginPath()
      context.arc(item.x, item.y, selected ? 12 : 9, 0, Math.PI * 2)
      context.fillStyle = color
      context.fill()
      context.lineWidth = selected ? 3 : 2
      context.strokeStyle = 'rgba(255, 255, 255, 0.94)'
      context.stroke()

      context.shadowBlur = 0
      context.font = '700 10px system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.fillStyle = '#ffffff'
      context.fillText(markerGlyph(label), item.x, item.y + 0.5)
      context.restore()
    }
  }, [canvasPoints, enabled, labelById, selectedPointId, size.height, size.width])

  const resolvePointer = useCallback(
    (event: CanvasPointerEvent) => {
      const rect = event.currentTarget.getBoundingClientRect()
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top
      const hit = findHit(canvasPoints, x, y)
      return {
        hit,
        position: hit
          ? {
              x: rect.left + hit.x,
              y: rect.top + hit.y,
            }
          : null,
      }
    },
    [canvasPoints],
  )

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 size-full"
      onPointerMove={(event) => {
        const { hit, position } = resolvePointer(event)
        onPointHover(hit?.point ?? null, position)
      }}
      onPointerLeave={() => onPointHover(null, null)}
      onClick={(event) => {
        const { hit, position } = resolvePointer(event)
        if (!hit || !position) return
        event.preventDefault()
        event.stopPropagation()
        onPointClick(hit.point, position)
      }}
    />
  )
}
