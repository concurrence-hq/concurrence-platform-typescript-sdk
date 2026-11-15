/**
 * Decide, from the pull requests of the rolling sync branch, whether the spec sync is paused.
 *
 * The sync is paused only when the most recently closed pull request from the branch was closed
 * without merging and no pull request from the branch is open. A pull request merged after that
 * one clears the pause, and so does an open one.
 */

const summary = (pr) => ({ number: pr.number, url: pr.html_url })

const closedTime = (pr) => Date.parse(pr.closed_at) || 0

/**
 * @param {unknown} pullRequests The REST list `GET /repos/{owner}/{repo}/pulls?state=all`: an
 *   array of pull requests, or an array of such pages.
 * @param {string} branch The rolling branch, the head of the pull requests that count.
 * @param {string} [base] The base branch of the pull requests that count.
 * @returns {{ paused: boolean, pausedBy: {number: number, url: string} | null,
 *   open: {number: number, url: string} | null }}
 */
export function decideSyncState(pullRequests, branch, base = 'main') {
  if (!Array.isArray(pullRequests)) {
    throw new Error('Expected a JSON array of pull requests')
  }
  const own = pullRequests.flat().filter((pr) => pr?.head?.ref === branch && pr?.base?.ref === base)

  const open = own.filter((pr) => pr.state === 'open').sort((a, b) => b.number - a.number)[0]
  const latestClosed = own
    .filter((pr) => pr.state === 'closed')
    .sort((a, b) => closedTime(b) - closedTime(a) || b.number - a.number)[0]

  const pausedBy = !open && latestClosed && !latestClosed.merged_at ? latestClosed : null
  return {
    paused: pausedBy !== null,
    pausedBy: pausedBy ? summary(pausedBy) : null,
    open: open ? summary(open) : null,
  }
}
