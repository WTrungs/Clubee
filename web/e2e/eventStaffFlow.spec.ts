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

  test('CLB được mời nhận lời đồng tổ chức; Trưởng BTC thêm nhân sự của CLB đó rồi gỡ CLB', async ({ page }, testInfo) => {
    // Seed có lời mời Đã gửi từ Đêm nhạc Mùa đông tới CLB Tiếng Anh; tu.chau là Chủ nhiệm CLB Tiếng Anh.
    await loginAs(page, 'tu.chau@demo.test')
    await page.goto('/clubs/c-english/events?tab=shared')
    const pending = page.getByRole('region', { name: 'Chờ trả lời (1)' })
    await expect(pending.getByText('Chủ trì: CLB Guitar Sinh viên')).toBeVisible()
    await snap(page, testInfo, 'sharedEvents')
    await pending.getByRole('button', { name: 'Chấp nhận đồng tổ chức Đêm nhạc Mùa đông' }).click()
    await settleToast(page, 'Đã nhận lời đồng tổ chức Đêm nhạc Mùa đông.')
    await expect(page.getByRole('region', { name: 'Đang đồng tổ chức (1)' })).toBeVisible()

    // Không tải lại trang: mock chạy trong trình duyệt nên tải lại là mất lời nhận vừa ghi.
    await switchUser(page, 'Châu Minh Tú', 'bao.tran@demo.test')
    await page.evaluate(() => {
      window.history.pushState({}, '', '/clubs/c-guitar/events/e-winter?tab=staff')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    const section = page.getByRole('region', { name: 'CLB đồng tổ chức' })
    await expect(section.getByText('Đang đồng tổ chức')).toBeVisible()

    await section.getByRole('button', { name: 'Mời CLB' }).click()
    const sheet = page.getByRole('dialog', { name: 'Mời CLB đồng tổ chức' })
    await expect(sheet.getByRole('button', { name: /CLB Tiếng Anh Giao tiếp/ })).toBeDisabled()
    await sheet.getByRole('button', { name: /Đội Tình nguyện Xanh/ }).click()
    await sheet.getByRole('textbox', { name: 'Lời nhắn' }).fill('Cùng làm góc tình nguyện nhé.')
    await snap(page, testInfo, 'inviteCoHost')
    await sheet.getByRole('button', { name: 'Gửi lời mời' }).click()
    await settleToast(page, 'Đã gửi lời mời tới Đội Tình nguyện Xanh.')
    await expect(section.getByText('Chờ trả lời')).toBeVisible()

    const card = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'Tiểu ban Hậu cần' }) })
    await card.getByRole('button', { name: 'Mời thành viên vào tiểu ban Hậu cần' }).click()
    const dialog = page.getByRole('dialog', { name: 'Mời vào tiểu ban Hậu cần' })
    await dialog.getByRole('combobox', { name: 'Nguồn nhân sự' }).selectOption({ label: 'CLB Tiếng Anh Giao tiếp (đồng tổ chức)' })
    await expect(dialog).toHaveAccessibleDescription('Thành viên Thử việc hoặc Chính thức của CLB Tiếng Anh Giao tiếp.')
    await dialog.getByRole('listitem').filter({ hasText: 'Dương Thanh Tâm' }).getByRole('button', { name: 'Thêm' }).click()
    await settleToast(page, 'Đã thêm Dương Thanh Tâm vào tiểu ban Hậu cần.')
    await page.keyboard.press('Escape')
    await expect(card.getByText('CLB Tiếng Anh Giao tiếp')).toBeVisible()
    await expect(section.getByText('1 nhân sự trong BTC')).toBeVisible()
    await expectNoHorizontalScroll(page)
    await snap(page, testInfo, 'coHostStaff')

    await section.getByRole('button', { name: 'Gỡ CLB Tiếng Anh Giao tiếp khỏi ban tổ chức' }).click()
    const removal = page.getByRole('dialog', { name: 'Gỡ CLB Tiếng Anh Giao tiếp' })
    await removal.getByRole('textbox', { name: /Lý do/ }).fill('Đổi kế hoạch chương trình.')
    await removal.getByRole('button', { name: 'Gỡ CLB' }).click()
    await settleToast(page, 'Đã gỡ CLB Tiếng Anh Giao tiếp. Nhân sự của CLB này đã rời ban tổ chức.')
    await expect(section.getByText('Lý do gỡ: Đổi kế hoạch chương trình.')).toBeVisible()
    await expect(card.getByText('Dương Thanh Tâm')).toHaveCount(0)
  })
})
