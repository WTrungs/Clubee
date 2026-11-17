import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, Route, RouterProvider, Routes, useLocation } from 'react-router'
import { endSession } from '@/api/mocks/mockSession'
import { createQueryClient, sessionQueryKey } from '@/api/queryClient'
import { useClubDetail } from '@/features/club/viewModel/useClubDetail'
import { createTestWrapper, signInAs } from '@/testUtils'
import { GuestOnly, RequireAuth } from '../view/RequireAuth'
import { useCurrentUser, useLogout } from './useSession'

function SignedInPage() {
  const user = useCurrentUser()
  const { logout } = useLogout()
  const club = useClubDetail('c-guitar')
  return (
    <div>
      <p>Xin chào {user.fullName}</p>
      <p>{club.data ? `Chức vụ: ${club.data.myPositionTitles.join(', ') || 'không'}` : 'Đang tải CLB'}</p>
      <button type="button" onClick={logout}>
        Đăng xuất
      </button>
    </div>
  )
}

function LoginStub() {
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from
  return <p>Trang đăng nhập{from ? ` (từ ${from})` : ''}</p>
}

function renderApp(initialEntry: Parameters<typeof createTestWrapper>[0]) {
  const { wrapper: Wrapper, queryClient } = createTestWrapper(initialEntry)
  render(
    <Wrapper>
      <Routes>
        <Route element={<GuestOnly />}>
          <Route path="/login" element={<LoginStub />} />
        </Route>
        <Route element={<RequireAuth />}>
          <Route path="/clubs" element={<SignedInPage />} />
          <Route path="/clubs/:clubId" element={<SignedInPage />} />
        </Route>
      </Routes>
    </Wrapper>,
  )
  return { queryClient }
}

afterEach(() => vi.restoreAllMocks())

describe('session flow', () => {
  it('logs out without a render error and drops the previous user data', async () => {
    const consoleError = vi.spyOn(console, 'error')
    signInAs('u-anh')
    const { queryClient } = renderApp('/clubs')
    await screen.findByText('Chức vụ: Chủ nhiệm')

    await userEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }))

    // Có lúc RequireAuth chuyển hướng trước lệnh điều hướng của đăng xuất nên trang kèm `from`; test này không xét `from`.
    await screen.findByText(/^Trang đăng nhập/)
    expect(queryClient.getQueryData(sessionQueryKey)).toBeNull()
    expect(queryClient.getQueryData(['clubs', 'c-guitar'])).toBeUndefined()
    expect(consoleError.mock.calls.flat().join(' ')).not.toContain('useCurrentUser must be used inside RequireAuth')
  })

  it('clears cached data when the session expires, so the next account never sees it (SRS 3.5)', async () => {
    signInAs('u-anh')
    const { queryClient } = renderApp('/clubs')
    await screen.findByText('Chức vụ: Chủ nhiệm')

    endSession()
    await act(() => queryClient.invalidateQueries({ queryKey: sessionQueryKey }))

    await screen.findByText(/Trang đăng nhập/)
    expect(queryClient.getQueryData(['clubs', 'c-guitar'])).toBeUndefined()
  })

  it('sends a signed-out visitor to the login page and remembers where they were going', async () => {
    renderApp('/clubs/c-guitar')
    expect(await screen.findByText('Trang đăng nhập (từ /clubs/c-guitar)')).toBeInTheDocument()
  })

  it('takes a signed-in user away from the login page to the page they wanted', async () => {
    signInAs('u-ha')
    renderApp({ pathname: '/login', state: { from: '/clubs/c-guitar' } })
    await waitFor(() => expect(screen.getByText('Xin chào Lê Thu Hà')).toBeInTheDocument())
    expect(await screen.findByText('Chức vụ: không')).toBeInTheDocument()
  })
})

/** Dựng router có một trang tải theo yêu cầu và giữ trang đó lại, như lúc chunk chưa tải xong. */
function renderWithHeldPage(initialEntry: string, heldPath: '/login' | '/clubs') {
  let release = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  const page = (path: string, text: string) =>
    path === heldPath ? { path, lazy: () => held.then(() => ({ Component: () => <p>{text}</p> })) } : { path, element: <p>{text}</p> }
  const router = createMemoryRouter(
    [
      { element: <GuestOnly />, children: [page('/login', 'Trang đăng nhập')] },
      { element: <RequireAuth />, children: [page('/clubs', 'CLB của tôi')] },
    ],
    { initialEntries: [initialEntry] },
  )
  const queryClient = createQueryClient()
  queryClient.setDefaultOptions({ queries: { retry: false, staleTime: 0 } })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { router, release }
}

describe('redirect to a page that loads on demand', () => {
  it('keeps a loader on screen while the login page is still loading', async () => {
    const { router, release } = renderWithHeldPage('/clubs', '/login')
    await waitFor(() => expect(router.state.navigation.location?.pathname).toBe('/login'))

    expect(screen.getByRole('status')).toHaveTextContent('Đang tải…')

    release()
    expect(await screen.findByText('Trang đăng nhập')).toBeInTheDocument()
  })

  it('keeps a loader on screen while the first signed-in page is still loading', async () => {
    signInAs('u-ha')
    const { router, release } = renderWithHeldPage('/login', '/clubs')
    await waitFor(() => expect(router.state.navigation.location?.pathname).toBe('/clubs'))

    expect(screen.getByRole('status')).toHaveTextContent('Đang tải…')

    release()
    expect(await screen.findByText('CLB của tôi')).toBeInTheDocument()
  })
})
