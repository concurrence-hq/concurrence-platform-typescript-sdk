import { IdentityResource } from './identity/base.js'
import type { SsoIndependentGrant } from './sso-grants.js'

export interface SsoGroupIndependentSnapshot {
  mapping_id: string
  /** Current approved mapping revision, pinned by the conversion request. */
  mapping_revision: string
  grant_id: string
  independent: SsoIndependentGrant
}

export interface ConvertIndependentSsoGroupGrant {
  /** Forward the reviewed snapshot's mapping_revision verbatim. */
  expected_revision: string
  manual_grant_id: string
  /** Forward independent.updated_at verbatim; do not round through Date. */
  expected_updated_at: string
}

export interface SsoGroupIndependentConversion {
  mapping_id: string
  mapping_revision: string
  grant_id: string
  manual_grant_id: string
  /** False is an exact already-completed retry. */
  converted: boolean
}

/** Explicit group replacement preserves group-based offboarding without adding an app grant. */
export class SsoGroupGrantsResource extends IdentityResource {
  independent(mappingId: string, grantId: string): Promise<SsoGroupIndependentSnapshot> {
    return this.request(
      'GET',
      `sso/group-mappings/${encodeURIComponent(mappingId)}/grants/${encodeURIComponent(grantId)}/independent`,
    )
  }

  /** Requires fresh exact group proof and a current independent human administrator. */
  convertIndependent(
    mappingId: string,
    grantId: string,
    body: ConvertIndependentSsoGroupGrant,
  ): Promise<SsoGroupIndependentConversion> {
    return this.request(
      'POST',
      `sso/group-mappings/${encodeURIComponent(mappingId)}/grants/${encodeURIComponent(grantId)}/convert-independent`,
      body,
    )
  }
}
