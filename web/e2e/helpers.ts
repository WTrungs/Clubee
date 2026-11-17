import { expect, type Page, type TestInfo } from '@playwright/test'

/** Đăng nhập bằng tài khoản demo của mock; mock nhận mọi mật khẩu từ 8 ký tự nên dùng chuỗi ngẫu nhiên. */
export async function loginAs(page: Page, email: string): Promise<void> {
  await page.goto('/login')
  await page.getByRole('textbox', { name: 'Email' }).fill(email)
  await page.getByRole('textbox', { name: 'Mật khẩu', exact: true }).fill(crypto.randomUUID())
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
  await page.waitForURL('**/clubs')
}

/** Tài khoản quản trị hệ thống vào thẳng khu `/admin` (SRS 3.4). */
export async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto('/login')
  await page.getByRole('textbox', { name: 'Email' }).fill('admin@demo.test')
  await page.getByRole('textbox', { name: 'Mật khẩu', exact: true }).fill(crypto.randomUUID())
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
  await page.waitForURL('**/admin')
}

/** NFR-USA-01: không cuộn ngang ở mọi chiều rộng. */
export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow, 'trang bị cuộn ngang').toBeLessThanOrEqual(0)
}

export async function useDarkTheme(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('clubee.theme', 'dark')
    } catch {
      // Ignore: the screenshot then simply stays light.
    }
  })
}

/**
 * Chụp màn hình sau khi hiệu ứng vào trang đã chạy xong.
 * Đang kéo thả thì truyền `fullPage: false`: chụp toàn trang làm cửa sổ đổi kích thước và dnd-kit hủy thao tác kéo.
 */
export async function snap(page: Page, testInfo: TestInfo, name: string, { fullPage = true }: { fullPage?: boolean } = {}): Promise<void> {
  await page.waitForTimeout(1000)
  await expectNoHorizontalScroll(page)
  await page.screenshot({ path: `test-results/screens/${testInfo.project.name}/${name}.png`, fullPage })
}

/** Đi tới trang qua menu trong app (không tải lại trang, nên dữ liệu mock vừa ghi vẫn còn); màn hẹp thì mở drawer trước. */
export async function openNavLink(page: Page, name: string): Promise<void> {
  // Menu dạng drawer chỉ có dưới 1024 px (lg).
  if ((page.viewportSize()?.width ?? 1440) < 1024) await page.getByRole('button', { name: 'Mở menu' }).click()
  await page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('link', { name, exact: true }).filter({ visible: true }).first().click()
}

/** Đổi người dùng bằng menu trong app (không tải lại trang) để dữ liệu mock vừa ghi vẫn còn. */
export async function switchUser(page: Page, currentName: string, email: string): Promise<void> {
  await page.getByRole('button', { name: `Tài khoản: ${currentName}` }).click()
  await page.getByRole('menuitem', { name: 'Đăng xuất' }).click()
  await page.waitForURL('**/login')
  await page.getByRole('textbox', { name: 'Email' }).fill(email)
  await page.getByRole('textbox', { name: 'Mật khẩu', exact: true }).fill(crypto.randomUUID())
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
  await page.waitForURL((url) => url.pathname.startsWith('/clubs'))
}

/** Dưới 640 px toast nằm ở đáy và che nút; chuột còn trên toast thì toast không tự tắt, nên đưa chuột ra ngoài rồi chờ tắt (Task R). */
export async function settleToast(page: Page, toast: string): Promise<void> {
  await expect(page.getByText(toast)).toBeVisible()
  if ((page.viewportSize()?.width ?? 1440) >= 640) return
  await page.mouse.move(1, 1)
  await expect(page.getByText(toast)).toBeHidden({ timeout: 10_000 })
}

/** Mở thông báo mới nhất có tiêu đề khớp, từ chuông trên đầu trang. */
export async function openNotification(page: Page, title: RegExp): Promise<void> {
  await page.getByRole('link', { name: /^Thông báo/ }).click()
  await page.getByRole('button', { name: title }).first().click()
}
