import { IdentityResource } from './identity/base.js'

export interface ConfigureSsoLifecycle {
  provider: 'okta'
  login_app_id: string
  client_id: string
  /** Input-only RSA JWK JSON. Never persist in browser storage or query caches. */
  private_jwk: string
}

export interface VerifySsoLifecycle extends ConfigureSsoLifecycle {
  binding_id: string
}

export interface SsoLifecycleConfiguration {
  id: string
  workspace_id: string
  connection_id: string
  revision: string
  provider: 'okta'
  login_app_id: string
  client_id: string
  enabled: boolean
}

export interface SsoLifecycleObservation {
  connection_id: string
  binding_id: string
  is_active: boolean
  reason: string
  observed_at: string
}

export interface SsoLifecycleSnapshot extends SsoLifecycleObservation {
  complete: true
  pages_seen: number
  assignments_seen: number
  started_at: string
}

export interface SsoLifecycleRevision {
  configuration_id: string
  configuration_revision: string
}

export interface EnableSsoLifecycle extends SsoLifecycleRevision {
  binding_id: string
}

/** Tenant-specific provider configuration. Previews do not establish enforced access. */
export class SsoLifecycleResource extends IdentityResource {
  getConfiguration(): Promise<SsoLifecycleConfiguration> {
    return this.request('GET', 'sso/lifecycle/configuration')
  }

  configure(body: ConfigureSsoLifecycle): Promise<SsoLifecycleConfiguration> {
    return this.request('PUT', 'sso/lifecycle/configuration', body)
  }

  verify(body: VerifySsoLifecycle): Promise<SsoLifecycleObservation> {
    return this.request('POST', 'sso/lifecycle/verify', body)
  }

  snapshot(body: VerifySsoLifecycle): Promise<SsoLifecycleSnapshot> {
    return this.request('POST', 'sso/lifecycle/snapshot', body)
  }

  enable(body: EnableSsoLifecycle): Promise<SsoLifecycleConfiguration> {
    return this.request('POST', 'sso/lifecycle/enable', body)
  }

  disable(body: SsoLifecycleRevision): Promise<SsoLifecycleConfiguration> {
    return this.request('POST', 'sso/lifecycle/disable', body)
  }
}
