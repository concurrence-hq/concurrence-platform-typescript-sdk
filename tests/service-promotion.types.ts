import { AmigoClient } from '../src/index.js'
import type {
  PromoteServiceConfigurationRequest,
  ServicePromotionReceipt,
  components,
} from '../src/index.js'

const client = new AmigoClient({ apiKey: 'test-key', workspaceId: 'ws-001' })
const request: PromoteServiceConfigurationRequest = {
  request_id: '11111111-1111-4111-8111-111111111111',
  expected_updated_at: '2026-11-12T02:03:04.123456+00:00',
  reviewed_base: [{ version_set: 'release', service_config_digest: `sha256:${'a'.repeat(64)}` }],
  target_version_set: 'release',
  version_set: { agent_version_number: 3, context_graph_version_number: 7 },
}

void (request satisfies components['schemas']['PromoteServiceConfigurationRequest'])

client.services.promoteConfiguration('service-001', request).then((receipt) => {
  void (receipt satisfies ServicePromotionReceipt)
  void (receipt satisfies components['schemas']['ServicePromotionReceipt'])
  void (receipt.service_config_digest satisfies string)
  void (receipt.lastResponse.statusCode satisfies number)
  void client.services.setSettings('service-001', {
    settings: {},
    expected_updated_at: receipt.updated_at,
  })
})

declare const withoutRequestId: Omit<PromoteServiceConfigurationRequest, 'request_id'>
// @ts-expect-error the caller supplies request_id; the SDK does not generate one
void client.services.promoteConfiguration('service-001', withoutRequestId)

declare const withoutReviewedBase: Omit<PromoteServiceConfigurationRequest, 'reviewed_base'>
// @ts-expect-error a promotion names the reviewed base it is conditional on
void client.services.promoteConfiguration('service-001', withoutReviewedBase)
