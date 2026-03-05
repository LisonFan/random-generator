const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400'
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

async function handleNameFake(request, url) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method Not Allowed' }, { status: 405 })
  }

  const gender = parseGender(url.searchParams.get('gender'))
  const upstreamUrl = `https://api.namefake.com/english-united-states/${encodeURIComponent(gender)}/`

  try {
    const upstreamRes = await fetch(upstreamUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'random-generator/1.0 (+https://workers.dev)'
      }
    })

    if (!upstreamRes.ok) {
      return jsonResponse(
        { error: 'Upstream Error', status: upstreamRes.status },
        { status: 502 }
      )
    }

    const upstreamJson = await upstreamRes.json()
    const first =
      upstreamJson?.first_name ||
      upstreamJson?.firstname ||
      upstreamJson?.first
    const last =
      upstreamJson?.last_name ||
      upstreamJson?.lastname ||
      upstreamJson?.last

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
  } catch (err) {
    return jsonResponse(
      { error: 'Fetch Failed', message: err?.message || String(err) },
      { status: 502 }
    )
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

