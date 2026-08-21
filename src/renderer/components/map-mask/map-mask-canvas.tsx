import { useEffect, useMemo, useRef, useState } from 'react'

import type {
  MapMaskLabel,
  VisibleMapMaskPoint,
} from 'renderer/types/map-mask'

type CanvasPoint = {
  point: VisibleMapMaskPoint
  x: number
  y: number
}

type MapMaskCanvasProps = {
  points: VisibleMapMaskPoint[]
  labels: MapMaskLabel[]
  enabled: boolean
}

const markerColors = [
  '#ff6b8a',
  '#39c5bb',
  '#f5b84b',
  '#8b7cf6',
  '#5bc0eb',
  '#7bd88f',
]

const markerColorByLabelId: Record<string, string> = {
  pearpal_box: '#f5c84b',
  pearpal_star: '#f472b6',
  pearpal_dewdrop: '#38bdf8',
  pearpal_read: '#4ade80',
}

function hashColor(value: string) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }
  return markerColors[hash % markerColors.length]
}

function markerColor(labelId: string) {
  return markerColorByLabelId[labelId] ?? hashColor(labelId)
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

export function MapMaskCanvas({
  points,
  labels,
  enabled,
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
      const color = markerColor(item.point.label_id)

      context.save()
      context.shadowColor = 'rgba(15, 23, 42, 0.45)'
      context.shadowBlur = 10
      context.beginPath()
      context.arc(item.x, item.y, 9, 0, Math.PI * 2)
      context.fillStyle = color
      context.fill()
      context.lineWidth = 2
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
  }, [canvasPoints, enabled, labelById, size.height, size.width])

  return (
    <canvas ref={canvasRef} className="absolute inset-0 size-full" />
  )
}
