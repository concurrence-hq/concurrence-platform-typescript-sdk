import { IdentityAdminResource } from './identity/base.js'

export type IdentityMachineCredentialType = 'api_key' | 'client_credentials'
export type IdentityHumanCredentialType = 'sso' | 'session_token'
export type IdentityCredentialType = IdentityMachineCredentialType | IdentityHumanCredentialType

/** Credential metadata. List/get/update responses never contain the plaintext secret. */
export interface IdentityCredentialInfo {
  id: string
  entity_id: string
  workspace_id: string
  credential_type: string
  key_id: string | null
  sso_provider: string | null
  scopes: string[]
  role: string | null
  name: string | null
  is_active: boolean
  rate_tier: string
  expires_at: string | null
  last_used_at: string | null
  created_at: string | null
}

export interface CreateIdentityCredential {
  entity_id: string
  workspace_id: string
  credential_type: IdentityCredentialType
  role?: string | null
  scopes?: string[]
  name?: string | null
  sso_provider?: string | null
  sso_subject?: string | null
  /** A timezone-aware ISO timestamp; omitted/null remains unbounded when server authority allows. */
  expires_at?: string | null
}

export type CreateIdentityMachineCredential = CreateIdentityCredential & {
  credential_type: IdentityMachineCredentialType
}
export type CreateIdentityHumanCredential = CreateIdentityCredential & {
  credential_type: IdentityHumanCredentialType
}

export interface IdentityCredentialCreated {
  credential: IdentityCredentialInfo
  client_id: string
  /** Returned once. Keep outside logs, query caches, URLs and browser storage. */
  client_secret: string
}

export interface UpdateIdentityCredential {
  role?: string | null
  scopes?: string[] | null
  is_active?: boolean | null
  name?: string | null
  /** Omit to preserve expiry. Explicit null removes expiry and requires authority to widen access. */
  expires_at?: string | null
}

export type IdentityCredentialSortField =
  | 'name'
  | 'created_at'
  | 'updated_at'
  | 'last_used_at'
  | 'credential_type'

export interface ListIdentityCredentials {
  workspace_id?: string
  is_active?: boolean
  search?: string
  sort_by?:
    | IdentityCredentialSortField
    | `+${IdentityCredentialSortField}`
    | `-${IdentityCredentialSortField}`
  /** Maximum 20. */
  limit?: number
  continuation_token?: number
}

export interface IdentityCredentialList {
  items: IdentityCredentialInfo[]
  has_more: boolean
  continuation_token: number | null
}

/** Identity credential administration, separate from the legacy Platform API key resource. */
export class IdentityCredentialsResource extends IdentityAdminResource {
  /** Filter by workspace explicitly; the server enforces access to each credential. */
  list(query: ListIdentityCredentials = {}): Promise<IdentityCredentialList> {
    return this.request('GET', 'credentials', undefined, { query: { ...query } })
  }

  get(credentialId: string): Promise<IdentityCredentialInfo> {
    return this.request('GET', `credentials/${encodeURIComponent(credentialId)}`)
  }

  create(body: CreateIdentityMachineCredential): Promise<IdentityCredentialCreated>
  create(body: CreateIdentityHumanCredential): Promise<IdentityCredentialInfo>
  create(
    body: CreateIdentityCredential,
  ): Promise<IdentityCredentialInfo | IdentityCredentialCreated>
  create(
    body: CreateIdentityCredential,
  ): Promise<IdentityCredentialInfo | IdentityCredentialCreated> {
    return this.request('POST', 'credentials', body)
  }

  update(credentialId: string, body: UpdateIdentityCredential): Promise<IdentityCredentialInfo> {
    return this.request('PATCH', `credentials/${encodeURIComponent(credentialId)}`, body)
  }

  /** Soft deactivation retains the credential record and associated data. */
  deactivate(credentialId: string): Promise<void> {
    return this.request('DELETE', `credentials/${encodeURIComponent(credentialId)}`)
  }
}
