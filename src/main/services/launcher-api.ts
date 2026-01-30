import { createHash } from "node:crypto"

const API_BASE = "https://www.nikkigallery.vip/api/v1"

type ApiRequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  data?: Record<string, unknown> | null
  accessToken?: string | null
}

export type Announcement = {
  title: string
  url?: string
  created_at: string
}

function buildAnnouncementsHash(announcements: Announcement[]) {
  const sorted = [...announcements].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
  const payload = sorted
    .map((item) => `${item.title}|${item.url ?? ""}|${item.created_at}`)
    .join("||")
  return createHash("md5").update(payload).digest("hex")
}

export async function getAnnouncements() {
  const response = await fetch(`${API_BASE}/whimbox/launcher/announcements`, {
    method: "GET",
  })
  if (!response.ok) {
    throw new Error(`获取公告失败 (${response.status})`)
  }
  const data = (await response.json()) as { announcements: Announcement[] }
  const hash = buildAnnouncementsHash(data.announcements ?? [])
  return { ...data, hash }
}

export async function apiRequest<T = unknown>(
  endpoint: string,
  options: ApiRequestOptions = {},
) {
  const { method = 'GET', data, accessToken } = options
  const url = new URL(`${API_BASE}${endpoint}`)
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`)
  }

  let body: string | undefined
  if (data && method === 'GET') {
    Object.entries(data).forEach(([key, value]) => {
      if (value != null) {
        url.searchParams.set(key, String(value))
      }
    })
  } else if (data) {
    body = JSON.stringify(data)
  }

  const response = await fetch(url.toString(), { method, headers, body })
  if (!response.ok) {
    let errorMessage = `请求失败 (${response.status})`
    try {
      const errorData = await response.json()
      errorMessage = errorData.message || errorData.error || errorMessage
    } catch {
      // ignore
    }
    throw new Error(errorMessage)
  }

  const contentType = response.headers.get('content-type')
  if (contentType?.includes('application/json')) {
    return (await response.json()) as T
  }
  return (await response.text()) as T
}
