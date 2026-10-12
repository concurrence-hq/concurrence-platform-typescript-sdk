import type { components, paths } from '../generated/api.js'
import type { WithResponseMetadata } from '../core/utils.js'
import { WorkspaceScopedResource, extractData } from './base.js'

export type IntakeFile = components['schemas']['IntakeFileRow']
export type IntakeFileStatus = components['schemas']['_FileStatus']
export type IntakeFileListResponse = components['schemas']['PaginatedResponse_IntakeFileRow_']
export type ListIntakeFilesParams = NonNullable<
  paths['/v1/{workspace_id}/intake/files']['get']['parameters']['query']
>

type UploadIntakeFileForm =
  components['schemas']['Body_upload_intake_file_v1__workspace_id__intake_files_post']

/**
 * Input for `intake.files.upload`. It matches the multipart form, except that `file` takes the
 * bytes and `doc_metadata` takes an object, which the SDK JSON-encodes into its form field.
 */
export interface UploadIntakeFileParams {
  /** Slug of the registered dataset the file lands in */
  dataset: UploadIntakeFileForm['dataset']
  /** The file. A `File` uploads under its own name. */
  file: Blob
  /**
   * Name to store the file under, defaulting to the `File`'s name. Set it for a plain `Blob`,
   * which otherwise uploads as `blob`. Document datasets read the file type from the extension.
   */
  filename?: string
  /** Document datasets only: add a new version to this document instead of starting a new one */
  document_id?: string
  /**
   * Document datasets only: tags that link a new document to a real-world subject, such as
   * `{ patient_id: '...' }`. A new version keeps its document's tags and can't send any.
   */
  doc_metadata?: Record<string, string>
}

export type IntakeDataset = components['schemas']['DatasetRow']
export type IntakeDatasetListResponse = components['schemas']['PaginatedResponse_DatasetRow_']
export type ListIntakeDatasetsParams = NonNullable<
  paths['/v1/{workspace_id}/intake/datasets']['get']['parameters']['query']
>
export type RegisterIntakeSchemaRequest = components['schemas']['RegisterSchemaRequest']
export type IntakeDatasetUpdateRun = components['schemas']['DatasetUpdateRunResponse']

export type IntakeSource = components['schemas']['IntakeSourceRow']
export type IntakeSourceListResponse = components['schemas']['PaginatedResponse_IntakeSourceRow_']
export type ListIntakeSourcesParams = NonNullable<
  paths['/v1/{workspace_id}/intake/sources']['get']['parameters']['query']
>
export type RegisterIntakeSourceRequest = components['schemas']['RegisterSourceRequest']
export type IntakeSourceSyncResponse = components['schemas']['SourceSyncResponse']

export type IntakeBatch = components['schemas']['BatchRow']
export type IntakeBatchDetail = components['schemas']['BatchDetail']
export type IntakeBatchListResponse = components['schemas']['PaginatedResponse_BatchRow_']
export type ListIntakeBatchesParams = NonNullable<
  paths['/v1/{workspace_id}/intake/batches']['get']['parameters']['query']
>

export type IntakeMaterializeRequest = components['schemas']['MaterializeRequest']
export type IntakeMaterializeResponse = components['schemas']['MaterializeResponse']
export type IntakeMaterialization = components['schemas']['MaterializationRow']
export type IntakeMaterializationListResponse =
  components['schemas']['PaginatedResponse_MaterializationRow_']
export type ListIntakeMaterializationsParams = NonNullable<
  paths['/v1/{workspace_id}/intake/materializations']['get']['parameters']['query']
>

/**
 * Customer data intake: files uploaded into registered datasets, the Google Shared Drive
 * sources that sync files in, the batches a sync produces, and the destination tables the
 * materializer writes.
 *
 * Every list takes `limit` (max 200), `sort_by` and `continuation_token`. Round-trip the
 * previous page's `continuation_token` verbatim, or use the `listAutoPaging` helpers.
 */
export class IntakeResource extends WorkspaceScopedResource {
  readonly files = {
    /** List intake files, newest first by default. Set `include_withdrawn` to keep withdrawn ones. */
    list: async (params?: ListIntakeFilesParams) =>
      extractData(
        await this.client.GET('/v1/{workspace_id}/intake/files', {
          params: { path: { workspace_id: this.workspaceId }, query: params },
        }),
      ),

    listAutoPaging: (params?: ListIntakeFilesParams): AsyncGenerator<IntakeFile> =>
      this.iteratePaginatedList((pageParams) => this.files.list(pageParams), params),

    /**
     * Upload a file into a dataset. A dataset with no registered schema or an empty file throws
     * `ValidationError`, and so does a file type a document dataset doesn't accept.
     */
    upload: async (params: UploadIntakeFileParams) => {
      const form = new FormData()
      form.append('dataset', params.dataset)
      // Node 20 and 22 name the part "undefined" when the filename argument is undefined.
      if (params.filename === undefined) form.append('file', params.file)
      else form.append('file', params.file, params.filename)
      if (params.document_id !== undefined) form.append('document_id', params.document_id)
      if (params.doc_metadata !== undefined) {
        form.append('doc_metadata', JSON.stringify(params.doc_metadata))
      }
      return extractData(
        await this.client.POST('/v1/{workspace_id}/intake/files', {
          params: { path: { workspace_id: this.workspaceId } },
          // The generated multipart body types `file` as a string; the form carries the bytes.
          body: form as unknown as UploadIntakeFileForm,
        }),
      )
    },

    // The explicit return type keeps the published declaration on the global `Blob`. Inferred,
    // it names Node's `buffer` module, which consumers without Node types can't resolve.
    /** Download a file's original bytes. The blob's `type` is the file's content type. */
    download: async (fileId: string): Promise<WithResponseMetadata<Blob>> =>
      extractData(
        await this.client.GET('/v1/{workspace_id}/intake/files/{file_id}/download', {
          params: { path: { workspace_id: this.workspaceId, file_id: fileId } },
          parseAs: 'blob',
        }),
      ),
  }

  readonly datasets = {
    /** List registered datasets, sorted by name by default */
    list: async (params?: ListIntakeDatasetsParams) =>
      extractData(
        await this.client.GET('/v1/{workspace_id}/intake/datasets', {
          params: { path: { workspace_id: this.workspaceId }, query: params },
        }),
      ),

    listAutoPaging: (params?: ListIntakeDatasetsParams): AsyncGenerator<IntakeDataset> =>
      this.iteratePaginatedList((pageParams) => this.datasets.list(pageParams), params),

    /** Register a dataset's schema, which creates the dataset. A taken name throws `ConflictError`. */
    registerSchema: async (body: RegisterIntakeSchemaRequest) =>
      extractData(
        await this.client.POST('/v1/{workspace_id}/intake/schema/register', {
          params: { path: { workspace_id: this.workspaceId } },
          body,
        }),
      ),

    /**
     * Start a dataset update: check the dataset's mapped Drive folders, prepare newly landed
     * files, then publish. While an update is active this returns that run instead of starting
     * another. Poll `getUpdateRun(run.run_id)` until the run leaves `checking_drive`,
     * `preparing` and `publishing`.
     */
    startUpdate: async (dataset: string) =>
      extractData(
        await this.client.POST('/v1/{workspace_id}/intake/datasets/{dataset}/update', {
          params: { path: { workspace_id: this.workspaceId, dataset } },
        }),
      ),

    /** Get a dataset update run, advanced to its current state */
    getUpdateRun: async (runId: string) =>
      extractData(
        await this.client.GET('/v1/{workspace_id}/intake/update-runs/{run_id}', {
          params: { path: { workspace_id: this.workspaceId, run_id: runId } },
        }),
      ),
  }

  readonly sources = {
    /** List registered sources, newest first by default */
    list: async (params?: ListIntakeSourcesParams) =>
      extractData(
        await this.client.GET('/v1/{workspace_id}/intake/sources', {
          params: { path: { workspace_id: this.workspaceId }, query: params },
        }),
      ),

    listAutoPaging: (params?: ListIntakeSourcesParams): AsyncGenerator<IntakeSource> =>
      this.iteratePaginatedList((pageParams) => this.sources.list(pageParams), params),

    /**
     * Register a Google Shared Drive source. Grant access on the Drive side: share each folder
     * with the platform's intake service account, or set `impersonate_subject` for domain-wide
     * delegation.
     */
    register: async (body: RegisterIntakeSourceRequest) =>
      extractData(
        await this.client.POST('/v1/{workspace_id}/intake/sources', {
          params: { path: { workspace_id: this.workspaceId } },
          body,
        }),
      ),

    /**
     * Remove a source registration. Upstream files and imported data stay. A sync in progress
     * throws `ConflictError`.
     */
    delete: async (sourceId: string): Promise<void> => {
      await this.client.DELETE('/v1/{workspace_id}/intake/sources/{source_id}', {
        params: { path: { workspace_id: this.workspaceId, source_id: sourceId } },
      })
    },

    /** Sync a source's mapped folders now. Returns one batch per folder. */
    sync: async (sourceId: string) =>
      extractData(
        await this.client.POST('/v1/{workspace_id}/intake/sources/{source_id}/sync', {
          params: { path: { workspace_id: this.workspaceId, source_id: sourceId } },
        }),
      ),
  }

  readonly batches = {
    /** List sync batches, newest first by default. Pass `source_id` for one source's batches. */
    list: async (params?: ListIntakeBatchesParams) =>
      extractData(
        await this.client.GET('/v1/{workspace_id}/intake/batches', {
          params: { path: { workspace_id: this.workspaceId }, query: params },
        }),
      ),

    listAutoPaging: (params?: ListIntakeBatchesParams): AsyncGenerator<IntakeBatch> =>
      this.iteratePaginatedList((pageParams) => this.batches.list(pageParams), params),

    /** Get a batch with its files */
    get: async (batchId: string) =>
      extractData(
        await this.client.GET('/v1/{workspace_id}/intake/batches/{batch_id}', {
          params: { path: { workspace_id: this.workspaceId, batch_id: batchId } },
        }),
      ),

    /**
     * Start processing a `ready` or `processing` batch. It dispatches only the files still
     * `received`, so calling it again resumes a partial run. A finished batch throws
     * `ConflictError`.
     */
    process: async (batchId: string) =>
      extractData(
        await this.client.POST('/v1/{workspace_id}/intake/batches/{batch_id}/process', {
          params: { path: { workspace_id: this.workspaceId, batch_id: batchId } },
        }),
      ),
  }

  readonly materializations = {
    /** List each dataset with the status of its customer-data destination table */
    list: async (params?: ListIntakeMaterializationsParams) =>
      extractData(
        await this.client.GET('/v1/{workspace_id}/intake/materializations', {
          params: { path: { workspace_id: this.workspaceId }, query: params },
        }),
      ),

    listAutoPaging: (
      params?: ListIntakeMaterializationsParams,
    ): AsyncGenerator<IntakeMaterialization> =>
      this.iteratePaginatedList((pageParams) => this.materializations.list(pageParams), params),
  }

  /**
   * Materialize curated snapshot datasets into their customer-data tables. Pass `dataset` for
   * one dataset, or omit the body for all of them. Writes are idempotent, so a repeat is safe.
   * `run_id` is the Databricks job run, or null where the job isn't configured.
   */
  async materialize(body?: IntakeMaterializeRequest) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/intake/materialize', {
        params: { path: { workspace_id: this.workspaceId } },
        body,
      }),
    )
  }
}
