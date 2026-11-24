import '@fontsource/be-vietnam-pro/400.css'
import '@fontsource/be-vietnam-pro/500.css'
import '@fontsource/be-vietnam-pro/600.css'
import '@fontsource/be-vietnam-pro/700.css'
import '@fontsource/be-vietnam-pro/800.css'
import './shared/styles/theme.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'
import { USE_MOCK } from './api/mockMode'
import { AppProviders } from './app/AppProviders'
import { router } from './app/router'
import { syncReducedMotion } from './shared/motion/reducedMotion'

async function enableMocking(): Promise<void> {
  if (!USE_MOCK) return
  const [{ worker }, { keepMockClientActive }] = await Promise.all([import('./api/mocks/browser'), import('./api/mocks/keepMockClientActive')])
  await worker.start({ onUnhandledFrame: 'bypass', quiet: true })
  keepMockClientActive()
}

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Missing #root element')

syncReducedMotion()
void enableMocking()
  .catch((error: unknown) => {
    // Still render: API calls then fail with a readable message instead of a blank page.
    console.error('Không khởi động được mock API', error)
  })
  .then(() => {
    createRoot(rootElement).render(
      <StrictMode>
        <AppProviders>
          <RouterProvider router={router} />
        </AppProviders>
      </StrictMode>,
    )
  })
