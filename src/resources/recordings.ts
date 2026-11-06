import type { WithResponseMetadata } from '../core/utils.js'
import { WorkspaceScopedResource, extractData } from './base.js'

export class RecordingsResource extends WorkspaceScopedResource {
  /** Presigned S3 URLs for the inbound (caller), outbound (agent), and merged stereo WAVs. */
  async get(callSid: string) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/recordings/{call_sid}', {
        params: { path: { workspace_id: this.workspaceId, call_sid: callSid } },
      }),
    )
  }

  /** A WAV clip of one channel of a call recording, between two offsets in milliseconds. */
  async getClip(
    callSid: string,
    params: { startMs: number; endMs: number; channel: 'inbound' | 'outbound' | 'stereo' },
  ): Promise<WithResponseMetadata<Blob>> {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/recordings/{call_sid}/clip', {
        params: {
          path: { workspace_id: this.workspaceId, call_sid: callSid },
          query: { start_ms: params.startMs, end_ms: params.endMs, channel: params.channel },
        },
        parseAs: 'blob',
      }),
    )
  }
}
