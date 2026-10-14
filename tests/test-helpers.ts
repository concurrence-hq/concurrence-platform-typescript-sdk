import { http, HttpResponse, type RequestHandler } from 'msw'
import { setupServer } from 'msw/node'
type PaginatedResponse<T> = { items: T[]; has_more: boolean; continuation_token: number | null }

export const TEST_API_KEY = 'test-api-key-abc123'
export const TEST_WORKSPACE_ID = 'ws-test-00000000-0000-0000-0000-000000000001'
export const BASE_URL = 'https://platform.api-us.concurrence.com'
export const WS_BASE = `${BASE_URL}/v1/${TEST_WORKSPACE_ID}`

// --- Fixtures ---

export const fixtures = {
  agent: () => ({
    id: 'agent-00000000-0000-0000-0000-000000000001',
    workspace_id: TEST_WORKSPACE_ID,
    name: 'Test Agent',
    description: 'A test agent',
    latest_version: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }),

  skill: () => ({
    id: 'skill-00000000-0000-0000-0000-000000000001',
    workspace_id: TEST_WORKSPACE_ID,
    slug: 'test-skill',
    name: 'Test Skill',
    description: 'A test skill',
    system_prompt: '',
    input_schema: { type: 'object', properties: {} },
    result_schema: null,
    model: 'claude-sonnet-4-6',
    integration_tools: [],
    static_tools: [],
    version: 1,
    enabled: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }),

  entity: () => ({
    id: 'entity-00000000-0000-0000-0000-000000000001',
    workspace_id: TEST_WORKSPACE_ID,
    entity_type: 'patient',
    display_name: 'Jane Doe',
    canonical_id: 'MRN-12345',
    external_ids: {},
    state: { name: 'Jane Doe', dob: '1980-01-01' },
    tags: [],
    source: null,
    confidence: 0.95,
    event_count: 0,
    has_projection: false,
    first_seen_at: '2026-01-01T00:00:00Z',
    last_event_at: null,
    name: 'Jane Doe',
    phone: null,
    email: null,
    mrn: 'MRN-12345',
    birth_date: '1980-01-01',
    gender: null,
    call_sid: null,
    direction: null,
    status: null,
    duration_seconds: null,
    appointment_start: null,
    appointment_end: null,
    appointment_status: null,
    appointment_type: null,
    deal_stage: null,
    deal_amount: null,
    domain: null,
    industry: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }),

  paginatedList: <T>(items: T[]): PaginatedResponse<T> => ({
    items,
    has_more: false,
    continuation_token: null,
  }),
}

// --- MSW server setup ---

export function createMockServer(...handlers: RequestHandler[]) {
  return setupServer(
    // Default auth/me handler
    http.get(`${BASE_URL}/v1/auth/me`, () =>
      HttpResponse.json({
        workspace_id: TEST_WORKSPACE_ID,
        key_id: 'key-001',
        name: 'Test Key',
        expires_at: '2026-12-31T00:00:00Z',
        expires_in_seconds: 86400,
      }),
    ),
    ...handlers,
  )
}

/** Verify the auth header was set correctly */
export function assertAuthHeader(request: Request): void {
  const auth = request.headers.get('Authorization')
  if (auth !== `Bearer ${TEST_API_KEY}`) {
    throw new Error(`Expected Authorization: Bearer ${TEST_API_KEY}, got: ${auth}`)
  }
}
