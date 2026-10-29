import { ConfigurationError } from '../core/errors.js'
import { IdentityResource } from './identity/base.js'
import type { ListSsoGrants, SsoIndependentGrant, SsoManagedGrant } from './sso-grants.js'

export interface SsoGroupManagedGrant extends SsoManagedGrant {
  mapping_id: string
  mapping_revision: string
}

export interface SsoGroupManagedGrantList {
  items: SsoGroupManagedGrant[]
  has_more: boolean
  continuation_token: unknown
}

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
  /** Discover stored contributions; conversion still requires a current independent snapshot. */
  async list(query: ListSsoGrants = {}): Promise<SsoGroupManagedGrantList> {
    const result = await this.request<SsoGroupManagedGrantList>(
      'GET',
      'sso/group-grants',
      undefined,
      { query: { ...query } },
    )
    for (const grant of result.items) {
      if (!Number.isSafeInteger(grant.source_version) || grant.source_version < 0) {
        throw new ConfigurationError('Managed grant revision cannot be represented safely')
      }
    }
    return result
  }

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
