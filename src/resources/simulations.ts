import type { components, operations, paths } from '../generated/api.js'
import type { ServiceId, SimulationRunId, SimulationSessionId } from '../core/branded-types.js'
import { WorkspaceScopedResource, extractData } from './base.js'

type CreateSimulationSessionRequest = components['schemas']['CreateSessionRequest']

/** Query parameters of one operation, typed from the generated spec. */
type QueryOf<Operation extends keyof operations> = NonNullable<
  operations[Operation]['parameters']['query']
>

/** JSON request body of one operation, typed from the generated spec. */
type BodyOf<Operation extends keyof operations> = operations[Operation] extends {
  requestBody: { content: { 'application/json': infer Body } }
}
  ? Body
  : never

export type ListSimulationRunsParams = NonNullable<
  paths['/v1/{workspace_id}/simulations/runs']['get']['parameters']['query']
>

/**
 * Simulations — interactive agent testing via the Playground.
 *
 * Create a session to get the agent's greeting, then step through the
 * conversation turn by turn. Get LLM-generated caller suggestions to
 * guide exploratory testing. Saved `cases` and `suites` run as graded
 * runs; read them back with `runs`, `suiteRuns` and `getPerformance`.
 */
export class SimulationsResource extends WorkspaceScopedResource {
  /** Start a simulation session — returns the agent's greeting and initial snapshot */
  async createSession(body: CreateSimulationSessionRequest) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/simulations/sessions', {
        params: { path: { workspace_id: this.workspaceId } },
        body,
      }),
    )
  }

  /** Get the current snapshot of a session */
  async getSession(sessionId: SimulationSessionId | string) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/simulations/sessions/{session_id}', {
        params: { path: { workspace_id: this.workspaceId, session_id: sessionId } },
      }),
    )
  }

  /** Delete a simulation session */
  async deleteSession(sessionId: SimulationSessionId | string) {
    return extractData(
      await this.client.DELETE('/v1/{workspace_id}/simulations/sessions/{session_id}', {
        params: { path: { workspace_id: this.workspaceId, session_id: sessionId } },
      }),
    )
  }

  /**
   * Send a caller utterance and advance the session named in `body` by one turn.
   * Returns the agent's response observation and updated snapshot. Nothing is
   * stored; use `stepSession` for a session under a coverage run.
   */
  async step(body: components['schemas']['StepRequest']) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/simulations/sessions/step', {
        params: { path: { workspace_id: this.workspaceId } },
        body,
      }),
    )
  }

  /**
   * Get LLM-generated caller message suggestions for the current session state.
   * Helps exploratory testing by suggesting realistic next caller turns.
   */
  async recommend(body: components['schemas']['RecommendRequest']) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/simulations/sessions/recommend', {
        params: { path: { workspace_id: this.workspaceId } },
        body,
      }),
    )
  }

  /** Get AI-generated call intelligence for a completed session */
  async getIntelligence(sessionId: SimulationSessionId | string) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/simulations/sessions/{session_id}/intelligence', {
        params: { path: { workspace_id: this.workspaceId, session_id: sessionId } },
      }),
    )
  }

  /**
   * Fork a session into N branches — clone the session at its current turn and
   * step each alternative caller utterance atomically. The session must belong
   * to a coverage run (branches attribute to the parent's `run_id`); forking a
   * run-less session is rejected server-side. `session_id` travels in the path,
   * so `body` carries only the alternatives.
   */
  async forkSession(
    sessionId: SimulationSessionId | string,
    body: components['schemas']['ForkRequest'],
  ) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/simulations/sessions/{session_id}/fork', {
        params: { path: { workspace_id: this.workspaceId, session_id: sessionId } },
        body,
      }),
    )
  }

  /** Assign a score (and optional rationale) to a completed simulation session. */
  async scoreSession(
    sessionId: SimulationSessionId | string,
    body: components['schemas']['ScoreSessionRequest'],
  ) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/simulations/sessions/{session_id}/score', {
        params: { path: { workspace_id: this.workspaceId, session_id: sessionId } },
        body,
      }),
    )
  }

  /**
   * Promote a run-less (interactive playground) session into a coverage run so
   * it can be forked/scored. Creates a run, binds the session to it, and writes
   * the coverage session record. Idempotent: a session that already belongs to
   * a run returns that run with `already_bound: true`. No request body —
   * `session_id` travels in the path.
   */
  async promoteSession(sessionId: SimulationSessionId | string) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/simulations/sessions/{session_id}/promote', {
        params: { path: { workspace_id: this.workspaceId, session_id: sessionId } },
      }),
    )
  }

  /**
   * Advance the session named in the path by one caller turn. When the session
   * belongs to a coverage run, the turn is stored as an observation for that
   * run's service graph. Leave `body.session_id` unset; a value that differs
   * from the path returns 422.
   */
  async stepSession(sessionId: SimulationSessionId | string, body: BodyOf<'simulation-step'>) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/simulations/sessions/{session_id}/step', {
        params: { path: { workspace_id: this.workspaceId, session_id: sessionId } },
        body,
      }),
    )
  }

  /** Get the stored turns of a coverage session, in turn order */
  async getSessionTurns(sessionId: SimulationSessionId | string) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/simulations/sessions/{session_id}/turns', {
        params: { path: { workspace_id: this.workspaceId, session_id: sessionId } },
      }),
    )
  }

  /**
   * Roll recent graded case and suite runs up into overall, per-metric,
   * per-case and per-suite pass rates. `limit` (1 to 50) bounds how many runs
   * are read; `service_id` narrows them to one service.
   */
  async getPerformance(params?: QueryOf<'get-simulation-performance'>) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/simulations/performance', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  /**
   * Map a config object onto the turn-policy overrides the simulator applies.
   * The policy is sparse: a field the config doesn't set is left out and keeps
   * its turn-policy default.
   */
  async configToPolicy(body: BodyOf<'config-to-turn-policy'>) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/simulations/config-to-policy', {
        params: { path: { workspace_id: this.workspaceId } },
        body,
      }),
    )
  }

  /**
   * Multi-session simulation runs — orchestrate a batch of scenarios against
   * a service to compute coverage and surface regressions. Use this when you
   * want to compare branch behavior or measure drift between versions.
   *
   * @beta New in this release; surface may evolve.
   */
  readonly runs = {
    /** List simulation runs in the workspace */
    list: async (params?: ListSimulationRunsParams) =>
      extractData(
        await this.client.GET('/v1/{workspace_id}/simulations/runs', {
          params: { path: { workspace_id: this.workspaceId }, query: params },
        }),
      ),

    /** Create a new simulation run */
    create: async (body: components['schemas']['CreateRunRequest']) =>
      extractData(
        await this.client.POST('/v1/{workspace_id}/simulations/runs', {
          params: { path: { workspace_id: this.workspaceId } },
          body,
        }),
      ),

    /** Get a simulation run with its scenarios + status */
    get: async (runId: SimulationRunId | string) =>
      extractData(
        await this.client.GET('/v1/{workspace_id}/simulations/runs/{run_id}', {
          params: { path: { workspace_id: this.workspaceId, run_id: runId } },
        }),
      ),

    /**
     * Finish a running run (used by the harness once all sessions finish). Pass
     * `error` with the failure reason to finish it as failed instead of
     * completed. A run finishes once; completing a finished run returns 409.
     */
    complete: async (
      runId: SimulationRunId | string,
      params?: QueryOf<'complete-simulation-run'>,
    ) =>
      extractData(
        await this.client.POST('/v1/{workspace_id}/simulations/runs/{run_id}/complete', {
          params: { path: { workspace_id: this.workspaceId, run_id: runId }, query: params },
        }),
      ),

    /** Spin up a session under a run (single scenario inside the run's batch) */
    createSession: async (runId: SimulationRunId | string, body: CreateSimulationSessionRequest) =>
      extractData(
        await this.client.POST('/v1/{workspace_id}/simulations/runs/{run_id}/sessions', {
          params: { path: { workspace_id: this.workspaceId, run_id: runId } },
          body,
        }),
      ),
  }

  /**
   * Saved simulation cases: durable scenarios (persona, instructions, evals)
   * that suites select and that run as graded case runs.
   */
  readonly cases = {
    /**
     * List one page of cases, newest first unless `sort_by` says otherwise.
     * `tags` matches cases that carry every tag; `total` counts every match.
     * Round-trip `continuation_token` from the previous page verbatim.
     */
    list: async (params?: QueryOf<'list-simulation-cases'>) =>
      extractData(
        await this.client.GET('/v1/{workspace_id}/simulations/cases', {
          params: { path: { workspace_id: this.workspaceId }, query: params },
        }),
      ),

    /** Create one or more cases in a single request */
    create: async (body: BodyOf<'create-simulation-cases'>) =>
      extractData(
        await this.client.POST('/v1/{workspace_id}/simulations/cases', {
          params: { path: { workspace_id: this.workspaceId } },
          body,
        }),
      ),

    /** Get one case */
    get: async (caseId: string) =>
      extractData(
        await this.client.GET('/v1/{workspace_id}/simulations/cases/{case_id}', {
          params: { path: { workspace_id: this.workspaceId, case_id: caseId } },
        }),
      ),

    /** Update a case's editable fields; fields left out keep their value */
    update: async (caseId: string, body: BodyOf<'update-simulation-case'>) =>
      extractData(
        await this.client.PATCH('/v1/{workspace_id}/simulations/cases/{case_id}', {
          params: { path: { workspace_id: this.workspaceId, case_id: caseId } },
          body,
        }),
      ),

    /** Delete a case and remove it from every suite that lists it */
    delete: async (caseId: string): Promise<void> => {
      await this.client.DELETE('/v1/{workspace_id}/simulations/cases/{case_id}', {
        params: { path: { workspace_id: this.workspaceId, case_id: caseId } },
      })
    },

    /**
     * Start a graded run of one case. The case runs against its saved service
     * unless `service_id` overrides it.
     */
    run: async (caseId: string, body: BodyOf<'run-simulation-case'>) =>
      extractData(
        await this.client.POST('/v1/{workspace_id}/simulations/cases/{case_id}/run', {
          params: { path: { workspace_id: this.workspaceId, case_id: caseId } },
          body,
        }),
      ),
  }

  /**
   * Simulation suites: named selections of saved cases (explicit `case_ids`
   * plus every case carrying all `required_tags`) that run as one suite run.
   */
  readonly suites = {
    /** List every suite in the workspace with its case count */
    list: async () =>
      extractData(
        await this.client.GET('/v1/{workspace_id}/simulations/suites', {
          params: { path: { workspace_id: this.workspaceId } },
        }),
      ),

    /** Create a suite */
    create: async (body: BodyOf<'create-simulation-suite'>) =>
      extractData(
        await this.client.POST('/v1/{workspace_id}/simulations/suites', {
          params: { path: { workspace_id: this.workspaceId } },
          body,
        }),
      ),

    /** Get one suite */
    get: async (suiteId: string) =>
      extractData(
        await this.client.GET('/v1/{workspace_id}/simulations/suites/{suite_id}', {
          params: { path: { workspace_id: this.workspaceId, suite_id: suiteId } },
        }),
      ),

    /** Update a suite; fields left out keep their value */
    update: async (suiteId: string, body: BodyOf<'update-simulation-suite'>) =>
      extractData(
        await this.client.PATCH('/v1/{workspace_id}/simulations/suites/{suite_id}', {
          params: { path: { workspace_id: this.workspaceId, suite_id: suiteId } },
          body,
        }),
      ),

    /** Delete a suite. Its cases stay in the library. */
    delete: async (suiteId: string): Promise<void> => {
      await this.client.DELETE('/v1/{workspace_id}/simulations/suites/{suite_id}', {
        params: { path: { workspace_id: this.workspaceId, suite_id: suiteId } },
      })
    },

    /**
     * Start a suite run: one graded case run per selected case. The response's
     * `batch_id` is the suite run id to read back with `suiteRuns.get`.
     */
    run: async (suiteId: string, body: BodyOf<'run-simulation-suite'>) =>
      extractData(
        await this.client.POST('/v1/{workspace_id}/simulations/suites/{suite_id}/run', {
          params: { path: { workspace_id: this.workspaceId, suite_id: suiteId } },
          body,
        }),
      ),

    /** List the suite's runs, newest first, with status counts per run */
    listRuns: async (suiteId: string, params?: QueryOf<'list-simulation-suite-runs'>) =>
      extractData(
        await this.client.GET('/v1/{workspace_id}/simulations/suites/{suite_id}/runs', {
          params: { path: { workspace_id: this.workspaceId, suite_id: suiteId }, query: params },
        }),
      ),

    /**
     * List one page of the cases the suite selects, for explicit, tag-defined
     * and hybrid suites alike. Without `search`, `total` equals the suite's
     * `case_count`.
     */
    listCases: async (suiteId: string, params?: QueryOf<'list-simulation-suite-cases'>) =>
      extractData(
        await this.client.GET('/v1/{workspace_id}/simulations/suites/{suite_id}/cases', {
          params: { path: { workspace_id: this.workspaceId, suite_id: suiteId }, query: params },
        }),
      ),
  }

  /** Suite runs: the durable record of one suite launch */
  readonly suiteRuns = {
    /**
     * Get a suite run's server-side summary (expected vs started cases, status
     * counts) and its aggregate results across every case run.
     */
    get: async (suiteRunId: string) =>
      extractData(
        await this.client.GET('/v1/{workspace_id}/simulations/suite-runs/{suite_run_id}', {
          params: { path: { workspace_id: this.workspaceId, suite_run_id: suiteRunId } },
        }),
      ),
  }

  /** Benchmarks: batches of saved cases selected by `suite_id` or `required_tags` */
  readonly benchmarks = {
    /**
     * Start one graded case run per selected case. With `suite_id` it is a
     * suite run, and the response's `batch_id` is its suite run id.
     */
    run: async (body: BodyOf<'run-simulation-benchmark'>) =>
      extractData(
        await this.client.POST('/v1/{workspace_id}/simulations/benchmarks/run', {
          params: { path: { workspace_id: this.workspaceId } },
          body,
        }),
      ),

    /** Aggregate results over the run ids a benchmark or suite run returned */
    getResults: async (body: BodyOf<'get-simulation-benchmark-results'>) =>
      extractData(
        await this.client.POST('/v1/{workspace_id}/simulations/benchmarks/results', {
          params: { path: { workspace_id: this.workspaceId } },
          body,
        }),
      ),
  }

  /**
   * Bridge — convert recorded production calls into simulation scenarios so
   * they can be replayed against a candidate version.
   */
  readonly bridge = {
    /** Execute a bridge run and return the resulting run handle */
    run: async (body: components['schemas']['BridgeRequest']) =>
      extractData(
        await this.client.POST('/v1/{workspace_id}/simulations/bridge', {
          params: { path: { workspace_id: this.workspaceId } },
          body,
        }),
      ),
  }

  /**
   * Per-service simulation views — graph of explored conversation paths,
   * recorded sessions, and per-turn telemetry. Used by the developer console's
   * coverage tab to visualize what scenarios have been exercised.
   */
  readonly services = {
    /**
     * Get the conversation graph (nodes/edges) for a service. `run_id` narrows
     * it to one run; `include_turns` adds the per-turn observations.
     */
    getGraph: async (
      serviceId: ServiceId | string,
      params?: QueryOf<'get-simulation-coverage-graph'>,
    ) =>
      extractData(
        await this.client.GET('/v1/{workspace_id}/simulations/services/{service_id}/graph', {
          params: {
            path: { workspace_id: this.workspaceId, service_id: serviceId },
            query: params,
          },
        }),
      ),

    /** Reset / delete the service's accumulated graph */
    deleteGraph: async (serviceId: ServiceId | string) =>
      extractData(
        await this.client.DELETE('/v1/{workspace_id}/simulations/services/{service_id}/graph', {
          params: { path: { workspace_id: this.workspaceId, service_id: serviceId } },
        }),
      ),

    /** Get the set of explored conversation paths through the graph, optionally for one run */
    getGraphPaths: async (
      serviceId: ServiceId | string,
      params?: QueryOf<'get-simulation-coverage-paths'>,
    ) =>
      extractData(
        await this.client.GET('/v1/{workspace_id}/simulations/services/{service_id}/graph/paths', {
          params: {
            path: { workspace_id: this.workspaceId, service_id: serviceId },
            query: params,
          },
        }),
      ),

    /** List recorded sessions for the service, optionally for one run */
    listSessions: async (
      serviceId: ServiceId | string,
      params?: QueryOf<'list-simulation-sessions'>,
    ) =>
      extractData(
        await this.client.GET('/v1/{workspace_id}/simulations/services/{service_id}/sessions', {
          params: {
            path: { workspace_id: this.workspaceId, service_id: serviceId },
            query: params,
          },
        }),
      ),

    /** List per-turn observations for the service, filtered by state or transition */
    listTurns: async (serviceId: ServiceId | string, params?: QueryOf<'query-simulation-turns'>) =>
      extractData(
        await this.client.GET('/v1/{workspace_id}/simulations/services/{service_id}/turns', {
          params: {
            path: { workspace_id: this.workspaceId, service_id: serviceId },
            query: params,
          },
        }),
      ),
  }
}
