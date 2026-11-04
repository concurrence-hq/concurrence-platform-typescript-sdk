import { describe, expect, it } from 'vitest'
import { recordRoutes, WORKSPACE } from '../helpers/record-routes.js'

describe('SettingsResource', () => {
  it('dataResidency.get calls GET /settings/data-residency', async () => {
    const { client, requests } = recordRoutes(200)
    await client.settings.dataResidency.get()
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.pathname).toBe(`/v1/${WORKSPACE}/settings/data-residency`)
  })

  it('dataResidency.update calls PUT /settings/data-residency', async () => {
    const { client, requests } = recordRoutes(200)
    await client.settings.dataResidency.update({ probe: 'body' } as never)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('PUT')
    expect(requests[0]?.pathname).toBe(`/v1/${WORKSPACE}/settings/data-residency`)
    expect(requests[0]?.body).toEqual({ probe: 'body' })
  })

  it('http.get calls GET /settings/http', async () => {
    const { client, requests } = recordRoutes(200)
    await client.settings.http.get()
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.pathname).toBe(`/v1/${WORKSPACE}/settings/http`)
  })

  it('http.update calls PUT /settings/http', async () => {
    const { client, requests } = recordRoutes(200)
    await client.settings.http.update({ probe: 'body' } as never)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('PUT')
    expect(requests[0]?.pathname).toBe(`/v1/${WORKSPACE}/settings/http`)
    expect(requests[0]?.body).toEqual({ probe: 'body' })
  })

  it('formTemplates.list calls GET /settings/form-templates', async () => {
    const { client, requests } = recordRoutes(200)
    await client.settings.formTemplates.list()
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.pathname).toBe(`/v1/${WORKSPACE}/settings/form-templates`)
  })

  it('formTemplates.update calls PUT /settings/form-templates', async () => {
    const { client, requests } = recordRoutes(200)
    await client.settings.formTemplates.update({ probe: 'body' } as never)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('PUT')
    expect(requests[0]?.pathname).toBe(`/v1/${WORKSPACE}/settings/form-templates`)
    expect(requests[0]?.body).toEqual({ probe: 'body' })
  })

  it('formTemplates.resolve calls POST /settings/form-templates/{template_id}/resolve', async () => {
    const { client, requests } = recordRoutes(200)
    await client.settings.formTemplates.resolve('template_id-1', { probe: 'body' } as never)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('POST')
    expect(requests[0]?.pathname).toBe(
      `/v1/${WORKSPACE}/settings/form-templates/template_id-1/resolve`,
    )
    expect(requests[0]?.body).toEqual({ probe: 'body' })
  })
})
