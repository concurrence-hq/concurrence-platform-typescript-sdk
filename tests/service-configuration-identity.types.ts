import { AmigoClient } from '../src/index.js'
import type {
  GetServiceConfigurationIdentityParams,
  ServiceConfigurationIdentityResponse,
} from '../src/index.js'

const client = new AmigoClient({ apiKey: 'test-key', workspaceId: 'ws-001' })
const params: GetServiceConfigurationIdentityParams = { version_set: 'release' }

client.services.getConfigurationIdentity('service-001', params).then((response) => {
  void (response satisfies ServiceConfigurationIdentityResponse)
  void (response.updated_at satisfies string)
  void client.services.setSettings('service-001', {
    settings: {},
    expected_updated_at: response.updated_at,
  })
  void client.services.setHarnessPins('service-001', {
    pins: [],
    expected_updated_at: response.updated_at,
  })
})

// @ts-expect-error callers must select a version set explicitly
void client.services.getConfigurationIdentity('service-001')
// @ts-expect-error an empty query must not select a default version set
void client.services.getConfigurationIdentity('service-001', {})
