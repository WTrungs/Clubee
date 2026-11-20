import '@fontsource/plus-jakarta-sans/400.css'
import '@fontsource/plus-jakarta-sans/500.css'
import '@fontsource/plus-jakarta-sans/600.css'
import '@fontsource/plus-jakarta-sans/700.css'
import '@fontsource/plus-jakarta-sans/800.css'
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
  const { worker } = await import('./api/mocks/browser')
  await worker.start({ onUnhandledFrame: 'bypass', quiet: true })
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
