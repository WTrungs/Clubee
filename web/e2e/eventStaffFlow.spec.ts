import { expect, test } from '@playwright/test'
import { expectNoHorizontalScroll, loginAs, openNavLink, settleToast, snap, switchUser } from './helpers.ts'

test.describe('Ban tổ chức sự kiện', () => {
  test('Trưởng BTC thêm cộng tác viên ngoài CLB; CTV mở sự kiện với tư cách khách', async ({ page }, testInfo) => {
    await loginAs(page, 'bao.tran@demo.test')
    await page.goto('/clubs/c-guitar/events/e-winter?tab=staff')
    const card = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'Tiểu ban Hậu cần' }) })
    await card.getByRole('button', { name: 'Thêm CTV vào tiểu ban Hậu cần' }).click()
    const dialog = page.getByRole('dialog', { name: 'Thêm cộng tác viên vào tiểu ban Hậu cần' })
    await dialog.getByRole('textbox', { name: 'Email tài khoản' }).fill('kiet.ly@demo.test')
    await dialog.getByRole('button', { name: 'Thêm cộng tác viên' }).click()
    await expect(dialog.getByText('Người này đang là thành viên CLB; dùng nút Mời để thêm như thành viên.')).toBeVisible()
    await snap(page, testInfo, 'addCollaborator')
    await dialog.getByRole('textbox', { name: 'Email tài khoản' }).fill('tam.duong@demo.test')
    await dialog.getByRole('button', { name: 'Thêm cộng tác viên' }).click()
    await settleToast(page, 'Đã thêm cộng tác viên vào tiểu ban Hậu cần.')
    await expect(card.getByText('Dương Thanh Tâm')).toBeVisible()
    await expect(card.getByText('CTV', { exact: true })).toBeVisible()

    // Không tải lại trang: mock chạy trong trình duyệt nên tải lại là mất CTV vừa thêm.
    await switchUser(page, 'Trần Quốc Bảo', 'tam.duong@demo.test')
    await openNavLink(page, 'CLB của tôi')
    const staffEvent = page.getByRole('link', { name: /Đêm nhạc Mùa đông/ })
    await expect(staffEvent).toContainText('Cộng tác viên')
    await staffEvent.click()
    await expect(page.getByRole('heading', { name: 'Đêm nhạc Mùa đông' })).toBeVisible()
    await expect(page.getByRole('button', { name: /với tư cách khách ban tổ chức/ })).toBeVisible()
    await expectNoHorizontalScroll(page)
    await snap(page, testInfo, 'eventAsGuest')

    if ((page.viewportSize()?.width ?? 1440) < 1024) await page.getByRole('button', { name: 'Mở menu' }).click()
    const nav = page.getByRole('navigation', { name: 'Điều hướng chính' }).filter({ visible: true }).first()
    await expect(nav.getByRole('link', { name: 'Sự kiện', exact: true })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Thành viên', exact: true })).toHaveCount(0)
    await snap(page, testInfo, 'guestMenu')
    await page.keyboard.press('Escape')

    await page.evaluate(() => {
      window.history.pushState({}, '', '/clubs/c-guitar/members')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    await expect(page.getByText('Bạn là khách ban tổ chức của CLB Guitar Sinh viên')).toBeVisible()
  })
})
