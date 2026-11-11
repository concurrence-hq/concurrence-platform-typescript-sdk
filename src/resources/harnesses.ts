import type { components, operations } from '../generated/api.js'
import { WorkspaceScopedResource, extractData } from './base.js'

export type ListHarnessReleasesParams = NonNullable<
  operations['list-harness-releases']['parameters']['query']
>
/** A registered release, named exactly, or `{ tag: 'in-tree' }`. */
export type HarnessReleaseRef = components['schemas']['ReleaseRef']
export type HarnessKind = components['schemas']['HarnessKind']

/**
 * Harness defaults and releases — platform-level routes that need the `platform:harnesses` or
 * `platform:admin` scope. They are not scoped to a workspace, so the client's workspace id
 * plays no part in them. Per-service pins and settings live on `client.services`.
 */
export class HarnessesResource extends WorkspaceScopedResource {
  /**
   * The release each harness runs on every service that does not pin one, one entry per
   * harness. A default the platform may no longer run says why (`refusal`).
   */
  async listDefaults() {
    return extractData(await this.client.GET('/v1/platform/harness-defaults', {}))
  }

  /**
   * Set the release a harness runs on every service that does not pin one: `{ tag: 'in-tree' }`
   * or a registered release named exactly, `{ repo, tag, asset, sha256 }`. Unpinned services
   * move on the sessions that start from 30 seconds after; pinned services never move. A
   * release that is not registered, is revoked, is the wrong kind or harness, or that the
   * running agent-engine image does not carry is refused. Audited.
   */
  async setDefault(kind: HarnessKind, harness: string, body: HarnessReleaseRef) {
    return extractData(
      await this.client.PUT('/v1/platform/harness-defaults/{kind}/{harness}', {
        params: { path: { kind, harness } },
        body,
      }),
    )
  }

  /**
   * The harness releases the platform may be asked to run, in the order they were imported,
   * filtered by `kind` and `harness`. Each says why the platform refuses it, if it does
   * (`refusal`), and whether the running agent-engine image carries it (`baked`). A release a
   * service may pin, or a default may name, has no `refusal` and is `baked`.
   */
  async listReleases(params?: ListHarnessReleasesParams) {
    return extractData(
      await this.client.GET('/v1/platform/harness-releases', {
        params: { query: params },
      }),
    )
  }
}
