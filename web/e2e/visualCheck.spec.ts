import { expect, test } from '@playwright/test'
import { expectNoVerticalScroll, loginAs, snap, useDarkTheme } from './helpers.ts'

test.describe('Tài khoản', () => {
  test('các trang khách', async ({ page }, testInfo) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'Chào mừng trở lại' })).toBeVisible()
    await expectNoVerticalScroll(page)
    const viewport = page.viewportSize()
    if (viewport) {
      // Trang đăng nhập vừa cả màn thấp: điện thoại 360×700, laptop 1366×768.
      await page.setViewportSize(viewport.width < 768 ? { width: 360, height: 700 } : { width: 1366, height: 768 })
      await expectNoVerticalScroll(page)
      await page.setViewportSize(viewport)
    }
    await snap(page, testInfo, 'login')

    await page.goto('/register')
    await expect(page.getByRole('heading', { name: 'Tạo tài khoản' })).toBeVisible()
    await page.getByRole('textbox', { name: 'Mật khẩu', exact: true }).fill(`Aa1!${crypto.randomUUID()}`)
    await snap(page, testInfo, 'register')

    await page.goto('/forgot-password')
    await expect(page.getByRole('heading', { name: 'Quên mật khẩu' })).toBeVisible()
    await snap(page, testInfo, 'forgotPassword')
  })

  test('đăng nhập sai hiện lý do', async ({ page }, testInfo) => {
    await page.goto('/login')
    await page.getByRole('textbox', { name: 'Email' }).fill('nobody@demo.test')
    await page.getByRole('textbox', { name: 'Mật khẩu', exact: true }).fill(crypto.randomUUID())
    await page.getByRole('button', { name: 'Đăng nhập' }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'Email hoặc mật khẩu không đúng.' })).toBeVisible()
    await snap(page, testInfo, 'loginError')
  })

  test('CLB của tôi và tổng quan CLB', async ({ page }, testInfo) => {
    await loginAs(page, 'anh.nguyen@demo.test')
    await expect(page.getByRole('heading', { name: 'CLB của tôi' })).toBeVisible()
    await snap(page, testInfo, 'myClubs')

    await page.getByRole('button', { name: /^CLB Guitar Sinh viên/ }).click()
    await page.waitForURL('**/clubs/c-guitar')
    await expect(page.getByRole('heading', { name: 'CLB Guitar Sinh viên' })).toBeVisible()
    await expect(page.getByRole('button', { name: /CLB hiện hành: CLB Guitar Sinh viên/ })).toBeVisible()
    await snap(page, testInfo, 'clubOverview')
  })

  test('giao diện tối', async ({ page }, testInfo) => {
    await useDarkTheme(page)
    await page.goto('/login')
    await snap(page, testInfo, 'loginDark')
    await loginAs(page, 'ha.le@demo.test')
    await page.goto('/clubs/c-guitar')
    await expect(page.getByRole('heading', { name: 'CLB Guitar Sinh viên' })).toBeVisible()
    await snap(page, testInfo, 'clubOverviewDark')
  })

  test('đăng xuất không phát sinh lỗi', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      // GET /me answers 401 while signed out by design; the browser logs that as a failed resource.
      if (message.type() === 'error' && !message.text().includes('status of 401')) errors.push(message.text())
    })
    await loginAs(page, 'anh.nguyen@demo.test')
    await page.getByRole('button', { name: /Tài khoản:/ }).click()
    await page.getByRole('menuitem', { name: 'Đăng xuất' }).click()
    await page.waitForURL('**/login')
    await expect(page.getByRole('heading', { name: 'Chào mừng trở lại' })).toBeVisible()
    expect(errors).toEqual([])
  })

  test('mở menu bằng bàn phím ở màn hẹp, focus nhìn thấy được', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile360', 'Menu dạng drawer chỉ có ở màn hẹp')
    await loginAs(page, 'anh.nguyen@demo.test')
    await page.getByRole('button', { name: 'Mở menu' }).focus()
    await page.keyboard.press('Enter')
    const focused = page.locator(':focus')
    await expect(focused).toBeVisible()
    const box = await focused.boundingBox()
    expect(box?.width ?? 0).toBeGreaterThan(20)
    await snap(page, testInfo, 'drawerFocus')
  })

  test('không phải thành viên thì thấy lý do từ máy chủ', async ({ page }, testInfo) => {
    await loginAs(page, 'ha.le@demo.test')
    await page.goto('/clubs/c-volunteer')
    await expect(page.getByText('Bạn không phải thành viên của CLB này.')).toBeVisible()
    await snap(page, testInfo, 'clubForbidden')
  })
})
