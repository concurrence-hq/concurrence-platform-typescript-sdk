import type { components, paths } from '../generated/api.js'
import { WorkspaceScopedResource, extractData } from './base.js'

/**
 * Workspace-level settings — configure voice, branding, data
 * retention, outreach rules, and more.
 *
 * Each sub-resource has `get()` and `update()`.
 */
export class SettingsResource extends WorkspaceScopedResource {
  readonly voice = {
    get: async () =>
      extractData(
        await this.client.GET('/v1/{workspace_id}/settings/voice', {
          params: { path: { workspace_id: this.workspaceId } },
        }),
      ),
    update: async (body: components['schemas']['VoiceSettingsRequest']) =>
      extractData(
        await this.client.PUT('/v1/{workspace_id}/settings/voice', {
          params: { path: { workspace_id: this.workspaceId } },
          body,
        }),
      ),
  }

  readonly branding = {
    get: async () =>
      extractData(
        await this.client.GET('/v1/{workspace_id}/settings/branding', {
          params: { path: { workspace_id: this.workspaceId } },
        }),
      ),
    update: async (body: components['schemas']['BrandingSettingsRequest']) =>
      extractData(
        await this.client.PUT('/v1/{workspace_id}/settings/branding', {
          params: { path: { workspace_id: this.workspaceId } },
          body,
        }),
      ),
  }

  readonly outreach = {
    get: async () =>
      extractData(
        await this.client.GET('/v1/{workspace_id}/settings/outreach', {
          params: { path: { workspace_id: this.workspaceId } },
        }),
      ),
    update: async (body: components['schemas']['OutreachSettingsRequest']) =>
      extractData(
        await this.client.PUT('/v1/{workspace_id}/settings/outreach', {
          params: { path: { workspace_id: this.workspaceId } },
          body,
        }),
      ),
  }

  readonly retention = {
    get: async () =>
      extractData(
        await this.client.GET('/v1/{workspace_id}/settings/retention', {
          params: { path: { workspace_id: this.workspaceId } },
        }),
      ),
    update: async (body: components['schemas']['RetentionPolicyRequest']) =>
      extractData(
        await this.client.PUT('/v1/{workspace_id}/settings/retention', {
          params: { path: { workspace_id: this.workspaceId } },
          body,
        }),
      ),
  }

  readonly metrics = {
    get: async () =>
      extractData(
        await this.client.GET('/v1/{workspace_id}/settings/metrics', {
          params: { path: { workspace_id: this.workspaceId } },
        }),
      ),
    update: async (body: components['schemas']['MetricSettingsRequest']) =>
      extractData(
        await this.client.PUT('/v1/{workspace_id}/settings/metrics', {
          params: { path: { workspace_id: this.workspaceId } },
          body,
        }),
      ),
  }

  readonly dataResidency = {
    /** Where this workspace's model calls may be processed. Any role. */
    get: async () =>
      extractData(
        await this.client.GET('/v1/{workspace_id}/settings/data-residency', {
          params: { path: { workspace_id: this.workspaceId } },
        }),
      ),

    /** Set where this workspace's model calls may be processed: `any` (anywhere a BAA covers them) or `regional` (only routes that stay in the region's geography). Turning `regional` on answers 422 with code `data_residency_refused`, listing every saved choice the region's policy forbids. An admin or owner can turn it on or leave it as it is. Turning it off, from `regional` to `any`, takes an owner: an admin gets 403. */
    update: async (body: components['schemas']['UpdateDataResidencyRequest']) =>
      extractData(
        await this.client.PUT('/v1/{workspace_id}/settings/data-residency', {
          params: { path: { workspace_id: this.workspaceId } },
          body,
        }),
      ),
  }

  readonly http = {
    /** Get the origins that may call this workspace's API from a browser. */
    get: async () =>
      extractData(
        await this.client.GET('/v1/{workspace_id}/settings/http', {
          params: { path: { workspace_id: this.workspaceId } },
        }),
      ),

    /** Replace the origins that may call this workspace's API from a browser. */
    update: async (body: components['schemas']['HttpSettings']) =>
      extractData(
        await this.client.PUT('/v1/{workspace_id}/settings/http', {
          params: { path: { workspace_id: this.workspaceId } },
          body,
        }),
      ),
  }

  readonly formTemplates = {
    /** List all form templates for a workspace. */
    list: async (
      params?: paths['/v1/{workspace_id}/settings/form-templates']['get']['parameters']['query'],
    ) =>
      extractData(
        await this.client.GET('/v1/{workspace_id}/settings/form-templates', {
          params: { path: { workspace_id: this.workspaceId }, query: params },
        }),
      ),

    /** Replace all form templates for a workspace. */
    update: async (body: components['schemas']['FormTemplateUpdateRequest']) =>
      extractData(
        await this.client.PUT('/v1/{workspace_id}/settings/form-templates', {
          params: { path: { workspace_id: this.workspaceId } },
          body,
        }),
      ),

    /** Resolve a form template with prefill values from entity state. */
    resolve: async (templateId: string, body: components['schemas']['ResolveTemplateRequest']) =>
      extractData(
        await this.client.POST('/v1/{workspace_id}/settings/form-templates/{template_id}/resolve', {
          params: { path: { workspace_id: this.workspaceId, template_id: templateId } },
          body,
        }),
      ),
  }
}
