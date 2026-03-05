import UserAgent from 'user-agents'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400'
}

const FALLBACK_CHROME_UA = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.6943.142 Safari/537.36'
]

class UpstreamError extends Error {
  constructor(status) {
    super(`Upstream status: ${status}`)
    this.status = status
  }
}

const jsonResponse = (data, init = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders,
      ...(init.headers || {})
    }
  })

const parseGender = (value) =>
  String(value || '').toLowerCase() === 'female' ? 'female' : 'male'

const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)]

const getRandomChromeUserAgent = () => {
  try {
    const ua = new UserAgent(
      (data) =>
        data?.deviceCategory === 'desktop' &&
        typeof data?.userAgent === 'string' &&
        data.userAgent.includes('Chrome/') &&
        !data.userAgent.includes('Edg/') &&
        !data.userAgent.includes('OPR/')
    ).toString()
    return typeof ua === 'string' && ua.includes('Chrome/')
      ? ua
      : pickOne(FALLBACK_CHROME_UA)
  } catch {
    return pickOne(FALLBACK_CHROME_UA)
  }
}

const methodGuard = (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method Not Allowed' }, { status: 405 })
  }
  return null
}

async function fetchUpstreamJson(upstreamUrl) {
  const upstreamRes = await fetch(upstreamUrl, {
    headers: {
      Accept: 'application/json',
      'User-Agent': getRandomChromeUserAgent()
    }
  })
  if (!upstreamRes.ok) throw new UpstreamError(upstreamRes.status)
  return upstreamRes.json()
}

const buildUpstreamError = (error) =>
  error instanceof UpstreamError
    ? jsonResponse(
        { error: 'Upstream Error', status: error.status },
        { status: 502 }
      )
    : jsonResponse(
        { error: 'Fetch Failed', message: error?.message || String(error) },
        { status: 502 }
      )

const extractFakerName = (record) => ({
  first:
    record?.firstname ||
    record?.first_name ||
    record?.first ||
    record?.name?.first ||
    record?.name?.firstname,
  last:
    record?.lastname ||
    record?.last_name ||
    record?.last ||
    record?.name?.last ||
    record?.name?.lastname
})

async function handleNameFake(request, url) {
  const methodRes = methodGuard(request)
  if (methodRes) return methodRes

  const gender = parseGender(url.searchParams.get('gender'))
  const upstreamUrl = `https://api.namefake.com/english-united-states/${encodeURIComponent(gender)}/`

  try {
    const upstreamJson = await fetchUpstreamJson(upstreamUrl)
    const first =
      upstreamJson?.first_name || upstreamJson?.firstname || upstreamJson?.first
    const last =
      upstreamJson?.last_name || upstreamJson?.lastname || upstreamJson?.last

    if (first && last) {
      return jsonResponse({ first, last, provider: 'namefake' }, { status: 200 })
    }

    const full = upstreamJson?.name
    if (typeof full === 'string') {
      const parts = full.trim().split(/\s+/).filter(Boolean)
      if (parts.length >= 2) {
        return jsonResponse(
          { first: parts[0], last: parts[parts.length - 1], provider: 'namefake' },
          { status: 200 }
        )
      }
    }

    return jsonResponse({ error: 'Invalid Upstream Response' }, { status: 502 })
  } catch (error) {
    return buildUpstreamError(error)
  }
}

async function handleRandomUser(request, url) {
  const methodRes = methodGuard(request)
  if (methodRes) return methodRes

  const gender = parseGender(url.searchParams.get('gender'))
  const upstreamUrl = `https://randomuser.me/api/?inc=name&noinfo&nat=us&gender=${encodeURIComponent(gender)}`

  try {
    const upstreamJson = await fetchUpstreamJson(upstreamUrl)
    const name = upstreamJson?.results?.[0]?.name
    const first = name?.first
    const last = name?.last
    if (!first || !last) {
      return jsonResponse({ error: 'Invalid Upstream Response' }, { status: 502 })
    }
    return jsonResponse({ first, last, provider: 'randomuser' }, { status: 200 })
  } catch (error) {
    return buildUpstreamError(error)
  }
}

async function handleFakerApi(request, url) {
  const methodRes = methodGuard(request)
  if (methodRes) return methodRes

  const gender = parseGender(url.searchParams.get('gender'))
  const upstreamUrl = `https://fakerapi.it/api/v2/persons?_quantity=1&_locale=en_US&_gender=${encodeURIComponent(gender)}`

  try {
    const upstreamJson = await fetchUpstreamJson(upstreamUrl)
    const record =
      (Array.isArray(upstreamJson?.data) ? upstreamJson.data[0] : null) ||
      upstreamJson?.data ||
      upstreamJson?.results?.[0] ||
      upstreamJson?.result
    const { first, last } = extractFakerName(record)
    if (!first || !last) {
      return jsonResponse({ error: 'Invalid Upstream Response' }, { status: 502 })
    }
    return jsonResponse({ first, last, provider: 'fakerapi' }, { status: 200 })
  } catch (error) {
    return buildUpstreamError(error)
  }
}

function assetRequestForIndex(request, url) {
  const nextUrl = new URL(url)
  nextUrl.pathname = '/index.html'
  return new Request(nextUrl.toString(), request)
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (url.pathname === '/api/namefake' || url.pathname === '/api/namefake/') {
      return handleNameFake(request, url)
    }
    if (url.pathname === '/api/randomuser' || url.pathname === '/api/randomuser/') {
      return handleRandomUser(request, url)
    }
    if (url.pathname === '/api/fakerapi' || url.pathname === '/api/fakerapi/') {
      return handleFakerApi(request, url)
    }

    if (request.method === 'OPTIONS' && url.pathname.startsWith('/api/')) {
      return new Response(null, { status: 204, headers: corsHeaders })
    }

    if (url.pathname === '/') {
      return env.ASSETS.fetch(assetRequestForIndex(request, url))
    }

    const assetRes = await env.ASSETS.fetch(request)
    if (assetRes.status === 404 && !url.pathname.includes('.')) {
      return env.ASSETS.fetch(assetRequestForIndex(request, url))
    }
    return assetRes
  }
}
