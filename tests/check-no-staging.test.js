import { describe, expect, it } from 'vitest'
import { stagingHosts } from '../scripts/check-no-staging.mjs'

describe('staging host guard', () => {
  it('finds the staging hosts of the public surfaces', () => {
    expect(stagingHosts('baseUrl: "https://api-staging.platform.example.com"')).toEqual([
      [1, 'api-staging'],
    ])
    expect(stagingHosts('open console-staging.concurrence.com\nand staging-eu.amigo.ai')).toEqual([
      [1, 'console-staging'],
      [2, 'staging-eu.amigo.ai'],
    ])
  })

  it('leaves the product feature and a customer staging workspace alone', () => {
    expect(stagingHosts('Create a staging clone of a service, then apply the mirror.')).toEqual([])
    expect(stagingHosts('Use your own staging workspace for rehearsals.')).toEqual([])
  })
})
