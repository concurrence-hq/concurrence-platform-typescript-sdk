import { ConfigurationError } from '../core/errors.js'
import { IdentityResource } from './identity/base.js'

export type SsoManagedRole = 'viewer' | 'operator' | 'member' | 'admin'

export interface ApproveSsoGrant {
  /** Generate once and reuse after an uncertain response. */
  id: string
  binding_id: string
  role: SsoManagedRole
}

export interface SsoManagedGrant {
  id: string
  workspace_id: string
  membership_id: string
  entity_id: string
  connection_id: string
  binding_id: string
  role: string
  is_active: boolean
  /** Server-owned observation revision; never increment this in a client. */
  source_version: number
  source_event_id: string | null
  approved_by_entity_id: string
  revoked_at: string | null
  created_at: string
  updated_at: string
}

export interface SsoManagedGrantList {
  items: SsoManagedGrant[]
  has_more: boolean
  continuation_token: unknown
}

export interface ListSsoGrants {
  limit?: number
  continuation_token?: unknown
  sort_by?: ('+created_at' | '-created_at')[]
}

export interface SsoIndependentGrant {
  id: string
  role: string
  scopes: string[]
  is_active: boolean
  /** Preserve this exact timestamp string for conversion; do not round through Date. */
  updated_at: string
}

export interface ConvertIndependentSsoGrant {
  manual_grant_id: string
  /** Forward the independent snapshot's updated_at verbatim. */
  expected_updated_at: string
}

function checkedGrant(grant: SsoManagedGrant): SsoManagedGrant {
  if (!Number.isSafeInteger(grant.source_version) || grant.source_version < 0) {
    throw new ConfigurationError('Managed grant revision cannot be represented safely')
  }
  return grant
}

/** Managed contributions remain separate from independent membership authority. */
export class SsoGrantsResource extends IdentityResource {
  async list(query: ListSsoGrants = {}): Promise<SsoManagedGrantList> {
    const result = await this.request<SsoManagedGrantList>('GET', 'sso/grants', undefined, {
      query: { ...query },
    })
    result.items.forEach(checkedGrant)
    return result
  }

  async approve(body: ApproveSsoGrant): Promise<SsoManagedGrant> {
    return checkedGrant(await this.request('POST', 'sso/grants', body))
  }

  /** Permanently revokes this approval while retaining its tombstone and data. */
  revoke(grantId: string): Promise<void> {
    return this.request('DELETE', `sso/grants/${encodeURIComponent(grantId)}`)
  }

  independent(grantId: string): Promise<SsoIndependentGrant> {
    return this.request('GET', `sso/grants/${encodeURIComponent(grantId)}/independent`)
  }

  async convertIndependent(
    grantId: string,
    body: ConvertIndependentSsoGrant,
  ): Promise<SsoManagedGrant> {
    return checkedGrant(
      await this.request(
        'POST',
        `sso/grants/${encodeURIComponent(grantId)}/convert-independent`,
        body,
      ),
    )
  }
}
