import { expect, test } from '@playwright/test'
import { loginAs, settleToast, snap } from './helpers.ts'

test.describe('Lời mời gia nhập', () => {
  test('chủ nhiệm tạo liên kết, mời qua email và thu hồi một lời mời', async ({ page }, testInfo) => {
    await loginAs(page, 'anh.nguyen@demo.test')
    await page.goto('/clubs/c-guitar/members')
    await page.getByRole('button', { name: 'Mời thành viên' }).click()
    const sheet = page.getByRole('dialog', { name: 'Mời thành viên' })
    const list = sheet.getByRole('region', { name: 'Lời mời đã tạo' })
    await expect(list.getByRole('listitem')).toHaveCount(2)

    await sheet.getByRole('button', { name: 'Tạo liên kết' }).click()
    await settleToast(page, 'Đã tạo liên kết mời.')
    await expect(sheet.getByText('Liên kết mới', { exact: false })).toBeVisible()
    await expect(list.getByRole('listitem')).toHaveCount(3)

    await sheet.getByRole('textbox', { name: 'Email người được mời' }).fill('ha.le@demo.test')
    await sheet.getByRole('button', { name: 'Gửi lời mời' }).click()
    await expect(sheet.getByText('Người này đã là thành viên.')).toBeVisible()
    await sheet.getByRole('textbox', { name: 'Email người được mời' }).fill('tu.chau@demo.test')
    await sheet.getByRole('button', { name: 'Gửi lời mời' }).click()
    await settleToast(page, 'Đã mời tu.chau@demo.test.')
    await snap(page, testInfo, 'invitationsSheet', { fullPage: false })

    const fresh = list.getByRole('listitem').filter({ hasText: 'Chưa ai dùng' })
    await fresh.getByRole('button', { name: 'Thu hồi' }).click()
    await page.getByRole('dialog', { name: 'Thu hồi lời mời' }).getByRole('button', { name: 'Thu hồi' }).click()
    await settleToast(page, 'Đã thu hồi lời mời.')
    await expect(list.getByRole('listitem').filter({ hasText: 'Đã thu hồi' })).toHaveCount(1)
    await sheet.getByRole('button', { name: 'Đã thu hồi' }).click()
    await expect(list.getByRole('listitem')).toHaveCount(1)
  })

  test('người ngoài CLB mở liên kết mời khi chưa đăng nhập, đăng nhập rồi gửi yêu cầu', async ({ page }, testInfo) => {
    await page.goto('/invite/demo-guitar')
    await page.waitForURL('**/login')
    await page.getByRole('textbox', { name: 'Email' }).fill('tu.chau@demo.test')
    await page.getByRole('textbox', { name: 'Mật khẩu', exact: true }).fill(crypto.randomUUID())
    await page.getByRole('button', { name: 'Đăng nhập' }).click()
    await page.waitForURL('**/invite/demo-guitar')

    await expect(page.getByRole('heading', { name: 'CLB Guitar Sinh viên' })).toBeVisible()
    await expect(page.getByText('Nguyễn Minh Anh')).toBeVisible()
    await snap(page, testInfo, 'invitationPage')
    await page.getByRole('button', { name: 'Xin gia nhập' }).click()
    const dialog = page.getByRole('dialog', { name: 'Xin gia nhập CLB Guitar Sinh viên' })
    await dialog.getByRole('textbox', { name: 'Lời giới thiệu' }).fill('Mình chơi guitar được một năm, muốn tham gia các đêm nhạc của CLB.')
    await dialog.getByRole('textbox', { name: 'MSSV' }).fill('SV26001')
    await dialog.getByRole('button', { name: 'Gửi yêu cầu' }).click()
    await settleToast(page, 'Đã gửi yêu cầu gia nhập CLB Guitar Sinh viên. Ban chủ nhiệm sẽ xem xét.')
    await expect(page.getByText('Yêu cầu của bạn đang chờ duyệt')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Xin gia nhập' })).toHaveCount(0)
  })

  test('mở lời mời đã hết hạn thấy lý do và lối sang Tìm CLB', async ({ page }, testInfo) => {
    await loginAs(page, 'tam.duong@demo.test')
    await page.goto('/invite/demo-guitar-old')
    await expect(page.getByText('Lời mời đã hết hạn')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Xin gia nhập' })).toHaveCount(0)
    await snap(page, testInfo, 'invitationExpired')
    await page.getByRole('link', { name: 'Tìm CLB' }).filter({ visible: true }).last().click()
    await expect(page.getByRole('heading', { name: 'Tìm CLB', level: 1 })).toBeVisible()
  })
})
