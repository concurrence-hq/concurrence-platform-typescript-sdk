import type { components } from '../../src/index.js'

export const WORKSPACE_ID = 'c8e1f2a4-6b7d-4f3e-9a10-2b5d8c7e4f61'
export const SET_ID = '3f2b8c1e-9d4a-4e6b-8a1c-5d7e9f0a1b2c'
export const OTHER_SET_ID = '9d41c7e2-5a3b-4f08-b6d1-7c2e8a90f3b4'
export const THIRD_SET_ID = 'b2f6a4d0-1c7e-4a39-8e55-0f3d6c9a7b18'
export const SERVICE_ID = 'e47a09b3-52c8-4d1f-a6e0-93b7d1c25f84'
export const SERVICE_UPDATED_AT = '2026-10-26T11:58:42.318204Z'

export const FIRST_VERSION_BODY = {
  condition: 'The caller has a question about a bill, a balance, a statement or a payment.',
  examples: ['Why did I get a bill for my last visit?', 'Can I set up a payment plan?'],
  instruction: 'Keep answers short and in plain words.',
  sticky_turns: 2,
  note: 'First version',
} satisfies components['schemas']['CreateDynamicBehaviorSetVersionRequest']

export const CREATE_SET_BODY = {
  name: 'Billing questions',
  tags: ['billing'],
  first_version: FIRST_VERSION_BODY,
} satisfies components['schemas']['CreateDynamicBehaviorSetRequest']

export const NEXT_VERSION_BODY = {
  condition: 'The caller has a question about a bill, or asks how to pay.',
  examples: ['How do I pay my balance?'],
  instruction: 'Ask which visit the caller means before explaining a charge.',
  mode: 'add',
  sticky_turns: 3,
  note: 'Added payment questions',
} satisfies components['schemas']['CreateDynamicBehaviorSetVersionRequest']

export const UPDATE_SET_BODY = {
  name: 'Billing and payments',
  tags: ['billing', 'payments'],
} satisfies components['schemas']['UpdateDynamicBehaviorSetRequest']

export const SET_FIXTURE = {
  id: SET_ID,
  workspace_id: WORKSPACE_ID,
  name: 'Billing questions',
  tags: ['billing'],
  latest_version: 1,
  archived_at: null,
  created_by: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  created_at: '2026-10-26T14:05:11.482913Z',
  updated_at: '2026-10-26T14:05:11.482913Z',
} satisfies components['schemas']['DynamicBehaviorSetResponse']

export const VERSION_FIXTURE = {
  set_id: SET_ID,
  version: 2,
  condition: NEXT_VERSION_BODY.condition,
  examples: NEXT_VERSION_BODY.examples,
  instruction: NEXT_VERSION_BODY.instruction,
  mode: 'add',
  sticky_turns: 3,
  note: NEXT_VERSION_BODY.note,
  created_by: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  created_at: '2026-10-26T14:22:40.108377Z',
} satisfies components['schemas']['DynamicBehaviorSetVersionResponse']

export const USAGE_ITEM_FIXTURE = {
  id: SERVICE_ID,
  name: 'Front Desk Line',
  version_sets: [{ name: 'release', version: 2, enabled: true, states: ['billing_help'] }],
} satisfies components['schemas']['PinningService']

/** Pins as a service read returns them: every field present, in the stored order. */
export const PINS_FIXTURE = [
  { set_id: SET_ID, version: 1, enabled: true, states: ['billing_help'] },
  { set_id: OTHER_SET_ID, version: 4, enabled: false, states: [] },
  { set_id: THIRD_SET_ID, version: 2, enabled: true, states: ['greeting', 'scheduling'] },
] satisfies components['schemas']['VersionSetBehaviorPin'][]

export const RELEASE_ENTRY_FIXTURE = {
  agent_version_number: 3,
  context_graph_version_number: null,
  llm_model_preferences: { voice: { llm_name: 'claude-sonnet-4-6', params: { temperature: 0.2 } } },
  dynamic_behavior_sets: PINS_FIXTURE,
} satisfies components['schemas']['VersionSet-Output']
