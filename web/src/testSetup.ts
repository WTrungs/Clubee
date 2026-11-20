import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { resetDb } from '@/api/mocks/db'
import { endSession } from '@/api/mocks/mockSession'
import { server } from '@/api/mocks/server'

// Unhandled requests fail the test, so no test can reach a real network.
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))

afterEach(() => {
  cleanup()
  server.resetHandlers()
  resetDb()
  endSession()
})

afterAll(() => server.close())
