/**
 * Re-registers this tab with the mock service worker whenever the tab becomes visible again.
 *
 * While a tab is hidden the browser throttles MSW's keepalive timer and may stop the idle worker. A restarted worker
 * has forgotten which tabs it mocks for, so it lets every request through to the real network (the Vite proxy) until
 * the page reloads. Sending `MOCK_ACTIVATE` again puts the tab back on its list; repeating it is harmless.
 *
 * `MOCK_ACTIVATE` is the message `public/mockServiceWorker.js` handles; check it still exists after upgrading `msw`.
 * Returns a function that removes the listener.
 */
export function keepMockClientActive(): () => void {
  const onVisibilityChange = () => {
    if (document.visibilityState !== 'visible') return
    navigator.serviceWorker?.controller?.postMessage('MOCK_ACTIVATE')
  }
  document.addEventListener('visibilitychange', onVisibilityChange)
  return () => document.removeEventListener('visibilitychange', onVisibilityChange)
}
