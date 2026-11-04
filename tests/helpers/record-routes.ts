import { AmigoClient } from '../../src/index.js'

export const WORKSPACE = '00000000-0000-0000-0000-000000000001'

export interface RecordedRequest {
  method: string
  pathname: string
  search: string
  headers: Headers
  body: unknown
}

/** Client whose fetch records every request and answers with `respond`, or an empty body. */
export function recordRoutes(
  status: 200 | 204,
  respond?: (request: Request) => Response | Promise<Response>,
) {
  const requests: RecordedRequest[] = []
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init)
    const url = new URL(request.url)
    const text = await request.clone().text()
    const contentType = request.headers.get('content-type') ?? ''
    requests.push({
      method: request.method,
      pathname: url.pathname,
      search: url.search,
      headers: request.headers,
      body: text && contentType.includes('json') ? JSON.parse(text) : undefined,
    })
    if (respond) return respond(request)
    return status === 204 ? new Response(null, { status }) : Response.json({})
  }
  const client = new AmigoClient({ apiKey: 'test-api-key', workspaceId: WORKSPACE, fetch })
  return { client, requests }
}
