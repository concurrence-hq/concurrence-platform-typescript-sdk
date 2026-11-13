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
const available = [dispatcherRoutes, startRoute, runnerApp].every((path) => existsSync(path))

function listBody(source: string, name: string): string {
  const match = new RegExp(`^${name} = \\[\\n([\\s\\S]*?)^\\]`, 'm').exec(source)
  if (!match) throw new Error(`${name} list not found in engine source`)
  return match[1]!
}

describe.skipIf(!available)('agent engine source: test-call ingress', () => {
  it('the dispatcher mounts the allocation route and not the test-call WebSocket', () => {
    const source = readFileSync(dispatcherRoutes, 'utf8')
    expect(source).toContain('router = APIRouter(prefix="/agent")')
    const mounted = listBody(source, '_sub_routers')
    expect(mounted).toMatch(/^\s*test_call_start_router,$/m)
    expect(mounted).not.toMatch(/^\s*test_call_router,$/m)
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
    // Non-idempotent: each request claims a slot and allocates a new GameServer.
    expect(source).toContain('allocation_id = uuid.uuid4().hex')
    expect(source).toContain('HTTPStatus.TOO_MANY_REQUESTS')
    expect(source).toContain('HTTPStatus.SERVICE_UNAVAILABLE')
  })
})
