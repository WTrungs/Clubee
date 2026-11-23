import { expect, test } from '@playwright/test'
import { loginAs, settleToast, snap } from './helpers.ts'

test.describe('Khách mời đăng ký sự kiện (FR-EVT-12)', () => {
  test('khách đăng ký bằng email, nhận mã QR, mở vé rồi tự hủy', async ({ page }, testInfo) => {
    await page.goto('/explore/events/e-winter')
    await expect(page.getByRole('heading', { name: 'Đêm nhạc Mùa đông', level: 1 })).toBeVisible()
    const form = page.getByRole('region', { name: 'Đăng ký tham dự' })
    await form.getByRole('textbox', { name: 'Họ tên' }).fill('Phạm An')
    await form.getByRole('button', { name: 'Đăng ký tham dự' }).click()
    await expect(form.getByRole('alert').filter({ hasText: 'Nhập email hoặc số điện thoại để nhận mã tham dự.' })).toBeVisible()
    await form.getByRole('textbox', { name: 'Email' }).fill('an.pham@khach.test')
    await snap(page, testInfo, 'guestForm')
    await form.getByRole('button', { name: 'Đăng ký tham dự' }).click()

    const done = page.getByRole('region', { name: 'Đăng ký thành công' })
    await expect(done.getByText('Đã nhận chỗ')).toBeVisible()
    await expect(done.getByRole('img', { name: /Mã QR tham dự/ })).toBeVisible()
    await expect(done.getByText('Mã tham dự Đêm nhạc Mùa đông')).toBeVisible()
    await expect(done.getByText('Mã tham dự đã gửi tới an***@khach.test', { exact: false })).toBeVisible()
    await snap(page, testInfo, 'guestRegistered')

    await done.getByRole('link', { name: 'Mở vé của tôi' }).click()
    await expect(page.getByRole('heading', { name: 'Vé tham dự', level: 1 })).toBeVisible()
    await expect(page.getByText('Đã nhận chỗ')).toBeVisible()
    await snap(page, testInfo, 'guestPass')
    await page.getByRole('button', { name: 'Hủy đăng ký' }).click()
    await page.getByRole('dialog', { name: 'Hủy đăng ký?' }).getByRole('button', { name: 'Hủy đăng ký' }).click()
    await settleToast(page, 'Đã hủy đăng ký.')
    await expect(page.getByText('Đã hủy đăng ký', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Hủy đăng ký' })).toHaveCount(0)
  })

  test('Trưởng BTC tra khách theo mã tham dự và ghi có mặt', async ({ page }, testInfo) => {
    await loginAs(page, 'kiet.ly@demo.test')
    await page.goto('/clubs/c-guitar/events/e-livestream?tab=attendance')
    const guests = page.getByRole('region', { name: 'Khách mời' })
    await guests.getByRole('searchbox', { name: 'Tra khách mời' }).fill('khach7q2')
    const list = guests.getByRole('list', { name: 'Danh sách khách mời' })
    await expect(list.getByRole('listitem')).toHaveCount(1)
    await expect(list).toContainText('ch***@khach.test')
    await list.getByRole('button', { name: 'Ghi có mặt: Phạm Minh Châu' }).click()
    await settleToast(page, 'Đã ghi có mặt: Phạm Minh Châu.')
    await expect(list.getByText(/Có mặt/)).toBeVisible()
    await snap(page, testInfo, 'guestCheckIn')

    await page.getByRole('tab', { name: 'Đăng ký' }).click()
    await expect(page.getByText('Khách mời', { exact: true }).first()).toBeVisible()
  })
})
