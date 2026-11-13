import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Pins the assumptions ``client.testCalls.start()`` makes to the agent engine's
 * own declarations, so the SDK tests are not only checked against a fake.
 *
 * The engine lives in a separate repository. These tests run when a checkout is
 * available (a sibling ``platform`` directory, or ``AMIGO_PLATFORM_SOURCE``)
 * and are skipped otherwise; they never contact a deployed engine.
 */
const engineRoot = resolve(
  process.env.AMIGO_PLATFORM_SOURCE ?? resolve(process.cwd(), '..', 'platform'),
  'services',
  'agent-engine',
  'src',
)
const dispatcherRoutes = resolve(engineRoot, 'routes', '__init__.py')
const startRoute = resolve(engineRoot, 'routes', 'test_call_start.py')
const runnerApp = resolve(engineRoot, 'persistent_voice_runner', 'fastapi_app.py')
const runnerSocket = resolve(engineRoot, 'voice', 'test_call.py')
const socketTransport = resolve(engineRoot, 'transport', 'websocket.py')
const prodDeployment = resolve(
  engineRoot,
  '..',
  '..',
  '..',
  'deployment',
  'agent-engine-prod',
  'deployment.tf',
)
const available = [
  dispatcherRoutes,
  startRoute,
  runnerApp,
  runnerSocket,
  socketTransport,
  prodDeployment,
].every((path) => existsSync(path))

function listBody(source: string, name: string): string {
  const start = source.indexOf(`\n${name} = [`)
  const end = source.indexOf(']', start)
  if (start < 0 || end < 0) throw new Error(`${name} list not found in engine source`)
  return source.slice(start, end)
}

describe.skipIf(!available)('agent engine source: test-call ingress', () => {
  it('the dispatcher mounts the allocation route and not the test-call WebSocket', () => {
    const source = readFileSync(dispatcherRoutes, 'utf8')
    expect(source).toContain('router = APIRouter(prefix="/agent")')
    const mounted = listBody(source, '_sub_routers')
    expect(mounted).toMatch(/\btest_call_start_router\b/)
    expect(mounted).not.toMatch(/\btest_call_router\b/)
    expect(source).not.toMatch(/import router as test_call_router/)
  })

  it('only the allocated voice runner mounts the test-call WebSocket', () => {
    const source = readFileSync(runnerApp, 'utf8')
    expect(listBody(source, '_voice_sub_routers')).toMatch(/\btest_call_router\b/)
    expect(source).toContain('_router = APIRouter(prefix="/agent")')
    expect(source).not.toContain('test_call_start')
  })

  it('declares the request, response and actor URL the SDK validates', () => {
    const source = readFileSync(startRoute, 'utf8')
    expect(source).toContain('@router.post("/test-call/start")')
    expect(source).toMatch(
      /class TestCallStartRequest\(BaseModel\):\n\s+workspace_id: uuid\.UUID\n\s+service_id: uuid\.UUID\n\s+caller_id: /,
    )
    expect(source).toMatch(/\n\s+context: TestCallContext \| None = None\n/)
    expect(source).toMatch(/class TestCallStartResponse\(BaseModel\):\n\s+ws_url: str\n/)
    expect(source).toMatch(/\n\s+call_sid: str\n\s+actor_token: str\n/)
    expect(source).toContain('actor_token = ""')
    expect(source).toContain('ws_url = f"wss://{actor_host}/agent/test-call?{query}"')
    expect(source).toContain(
      'actor_host = f"{endpoint.gameserver_name}.{app.actor_contour_ingress_suffix}"',
    )
    for (const declared of [
      '"workspace_id": str(workspace_id),',
      '"service_id": str(body.service_id),',
      '"encoding": "mulaw",',
      '"sample_rate": "8000",',
      '"allocation_id": allocation_id,',
      '**({"caller_id": body.caller_id} if body.caller_id else {}),',
      '**({"context_ref": context_ref} if context_ref is not None else {}),',
    ]) {
      expect(source).toContain(declared)
    }
    // No credential travels in the actor URL: the declared query is exactly this set.
    const query = source.slice(
      source.indexOf('query = urlencode('),
      source.indexOf('ws_url = f"wss://'),
    )
    expect([...query.matchAll(/"([a-z_]+)":/g)].map((match) => match[1])).toEqual([
      'workspace_id',
      'service_id',
      'encoding',
      'sample_rate',
      'allocation_id',
      'caller_id',
      'context_ref',
    ])
    // Non-idempotent: each request claims a slot and allocates a new GameServer.
    expect(source).toContain('allocation_id = uuid.uuid4().hex')
    expect(source).toContain('HTTPStatus.TOO_MANY_REQUESTS')
    expect(source).toContain('HTTPStatus.SERVICE_UNAVAILABLE')
  })

  it('declares the regional actor ingress domains the SDK documents as approved suffixes', () => {
    const source = readFileSync(prodDeployment, 'utf8')
    const start = source.indexOf('actor_ingress_domain = {')
    const block = source.slice(start, source.indexOf('}', start))
    expect(start).toBeGreaterThan(-1)
    expect([...block.matchAll(/"[a-z0-9-]+"\s*=\s*"([^"]+)"/g)].map((match) => match[1])).toEqual(
      ['actors-us.concurrence.com', 'actors-au.concurrence.com', 'eu', 'ca'].map((entry) =>
        entry.includes('.') ? entry : `actors-${entry}.concurrence.com`,
      ),
    )
    // The actor host is built from that suffix alone, not from the request's origin.
    const route = readFileSync(startRoute, 'utf8')
    expect(route).toContain(
      'actor_host = f"{endpoint.gameserver_name}.{app.actor_contour_ingress_suffix}"',
    )
    expect(route).not.toMatch(/request\.(url|base_url|headers)/)
  })

  it('issues an allocation call_sid that the runner never adopts as the live call id', () => {
    const route = readFileSync(startRoute, 'utf8')
    expect(route).toContain('call_sid = f"test-{uuid.uuid4().hex}"')
    // The allocation call_sid is logged and returned, never sent to the actor.
    const query = route.slice(
      route.indexOf('query = urlencode('),
      route.indexOf('ws_url = f"wss://'),
    )
    expect(query).not.toContain('call_sid')
    expect(route).not.toMatch(/allocate\([^)]*call_sid/)

    // The runner mints its own id in the transport handshake...
    const transport = readFileSync(socketTransport, 'utf8')
    expect(transport).toContain('call_sid = f"direct-{uuid.uuid4().hex[:12]}"')
    expect(transport).toContain('session_id=call_sid,')

    // ...and that id, not a query parameter, is what it registers and announces.
    const socket = readFileSync(runnerSocket, 'utf8')
    expect(socket).toContain('transport, metadata = await WebSocketTransport.handshake(')
    expect(socket).toContain('call_sid = metadata.session_id')
    expect(socket).toContain(
      'await websocket.send_json({"type": "session_started", "call_sid": call_sid})',
    )
    expect(socket).toContain('app.active_calls[call_sid] = call_info')
    expect(socket).not.toMatch(/call_sid: [^=\n]*Query\(/)
    expect(socket).not.toContain('query_params.get("call_sid")')
    // The slot is keyed by allocation_id, which is why the URL must keep it.
    expect(socket).toContain('await release_test_call_slot(resolved_workspace, allocation_id)')
  })
})
