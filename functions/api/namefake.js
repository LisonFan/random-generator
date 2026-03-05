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

export async function onRequest({ request }) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method Not Allowed' }, { status: 405 })
  }

  const url = new URL(request.url)
  const genderParam = (url.searchParams.get('gender') || 'male').toLowerCase()
  const gender = genderParam === 'female' ? 'female' : 'male'

  const upstreamUrl = `https://api.namefake.com/english-united-states/${encodeURIComponent(gender)}/`

  try {
    const upstreamRes = await fetch(upstreamUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'random-generator/1.0 (+https://pages.dev)'
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

