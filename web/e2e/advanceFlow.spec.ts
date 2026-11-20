import { expect, test } from '@playwright/test'
import { expectNoHorizontalScroll, loginAs, openNotification, settleToast, snap, switchUser } from './helpers.ts'

test.describe('Tạm ứng', () => {
  test('trưởng ban đề xuất tạm ứng, chủ nhiệm duyệt, thủ quỹ ghi đã ứng và sổ quỹ có khoản chi', async ({ page }, testInfo) => {
    // Luồng đủ vòng đời tạm ứng qua ba người, ở 360 px chạy gần một phút.
    test.slow()
    await loginAs(page, 'linh.dang@demo.test')
    await page.goto('/clubs/c-guitar/finance')
    const balance = page.getByRole('region', { name: 'Số dư Quỹ chung' })
    await balance.getByRole('button', { name: 'Đề xuất tạm ứng' }).click()
    const sheet = page.getByRole('dialog', { name: 'Đề xuất tạm ứng' })
    await expect(sheet.getByRole('textbox', { name: /Hạn quyết toán/ })).not.toHaveValue('')
    await sheet.getByRole('textbox', { name: /Số tiền/ }).fill('350000')
    await sheet.getByRole('combobox', { name: /Hạng mục/ }).selectOption({ label: 'In ấn, truyền thông' })
    await sheet.getByRole('textbox', { name: /Mục đích/ }).fill('In băng rôn cho buổi biểu diễn')
    await snap(page, testInfo, 'proposeAdvance', { fullPage: false })
    await sheet.getByRole('button', { name: 'Gửi đề xuất' }).click()
    await settleToast(page, 'Đã gửi đề xuất tạm ứng 350.000 đ. Ban chủ nhiệm sẽ được báo để duyệt.')

    await page.getByRole('tab', { name: 'Tạm ứng' }).click()
    await expect(page.getByRole('button', { name: /Tạm ứng In băng rôn cho buổi biểu diễn/ })).toBeVisible()
    await expectNoHorizontalScroll(page)
    await snap(page, testInfo, 'advanceList')

    // Không tải lại trang: mock chạy trong trình duyệt nên tải lại là mất đề xuất vừa gửi.
    await switchUser(page, 'Đặng Khánh Linh', 'anh.nguyen@demo.test')
    await openNotification(page, /Tạm ứng chờ duyệt: In băng rôn cho buổi biểu diễn/)
    await page.waitForURL((url) => url.pathname === '/clubs/c-guitar/finance' && url.searchParams.has('adv'))
    const toApprove = page.getByRole('dialog', { name: 'Tạm ứng' })
    await expect(toApprove.getByText('Chờ duyệt')).toBeVisible()
    await snap(page, testInfo, 'advanceToApprove', { fullPage: false })
    await toApprove.getByRole('button', { name: 'Duyệt' }).click()
    await settleToast(page, 'Đã duyệt tạm ứng. Thủ quỹ sẽ được báo để ghi đã ứng.')
    await expect(toApprove.getByText('Chờ ghi đã ứng')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(toApprove).toHaveCount(0)

    await switchUser(page, 'Nguyễn Minh Anh', 'mai.vo@demo.test')
    await openNotification(page, /Tạm ứng chờ ghi đã ứng: In băng rôn cho buổi biểu diễn/)
    const toDisburse = page.getByRole('dialog', { name: 'Tạm ứng' })
    await toDisburse.getByRole('button', { name: 'Ghi đã ứng' }).click()
    const confirm = page.getByRole('dialog', { name: 'Ghi đã ứng' })
    await expect(confirm.getByRole('status')).toContainText('sau khi ứng còn')
    await snap(page, testInfo, 'disburseAdvance', { fullPage: false })
    await confirm.getByRole('button', { name: 'Ghi đã ứng' }).click()
    await settleToast(page, 'Đã ghi đã ứng 350.000 đ.')
    await expect(toDisburse.getByText('Đã ứng', { exact: true }).first()).toBeVisible()
    await toDisburse.getByRole('button', { name: 'Xem khoản chi đã ghi sổ' }).click()
    await page.waitForURL((url) => url.searchParams.has('tx') && !url.searchParams.has('adv'))
    await expect(page.getByRole('dialog').getByText('In băng rôn cho buổi biểu diễn').first()).toBeVisible()
    await page.keyboard.press('Escape')

    await expect(page.getByRole('button', { name: /Tạm ứng: In băng rôn cho buổi biểu diễn \(Đặng Khánh Linh\)/ })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Số dư Quỹ chung' }).getByText('5.120.000')).toBeVisible()

    // FR-FIN-08: người ứng nộp chứng từ hai lần, Thủ quỹ xác nhận rồi chốt; phần thừa thành khoản hoàn trong sổ.
    await switchUser(page, 'Võ Ngọc Mai', 'linh.dang@demo.test')
    await openNotification(page, /Đã nhận tạm ứng: In băng rôn cho buổi biểu diễn/)
    const held = page.getByRole('dialog', { name: 'Tạm ứng' })
    const lines = [
      { amount: '200000', text: 'In băng rôn khổ lớn', toast: 'Đã nộp chứng từ 200.000 đ. Thủ quỹ sẽ được báo để xác nhận.' },
      { amount: '100000', text: 'In tờ rơi', toast: 'Đã nộp chứng từ 100.000 đ. Thủ quỹ sẽ được báo để xác nhận.' },
    ]
    for (const line of lines) {
      await held.getByRole('button', { name: 'Nộp chứng từ' }).click()
      const form = page.getByRole('dialog', { name: 'Nộp chứng từ quyết toán' })
      await form.getByRole('textbox', { name: /Số tiền đã chi/ }).fill(line.amount)
      await form.getByRole('textbox', { name: /Nội dung/ }).fill(line.text)
      await form.locator('input[type="file"]').setInputFiles({ name: `hoa-don-${line.amount}.pdf`, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 tong hop') })
      if (line.amount === '200000') await snap(page, testInfo, 'submitSettlement', { fullPage: false })
      await form.getByRole('button', { name: 'Nộp chứng từ' }).click()
      await settleToast(page, line.toast)
      await expect(form).toHaveCount(0)
    }
    await expect(held.getByRole('list', { name: 'Các lần nộp chứng từ' }).getByText('Chờ xác nhận')).toHaveCount(2)
    await page.keyboard.press('Escape')
    await expect(held).toHaveCount(0)

    await switchUser(page, 'Đặng Khánh Linh', 'mai.vo@demo.test')
    await openNotification(page, /Chứng từ quyết toán chờ xác nhận: In băng rôn cho buổi biểu diễn/)
    const toSettle = page.getByRole('dialog', { name: 'Tạm ứng' })
    for (const line of lines) {
      await toSettle.getByRole('button', { name: `Xác nhận ${line.text}` }).click()
      // Không chờ toast: hai toast cùng chữ; nút sau bị toast che thì Playwright tự chờ toast tắt rồi mới bấm.
      await expect(toSettle.getByRole('button', { name: `Xác nhận ${line.text}` })).toHaveCount(0)
    }
    await expect(toSettle.getByRole('progressbar', { name: 'Tiến độ quyết toán' })).toBeVisible()
    await toSettle.getByRole('button', { name: 'Chốt quyết toán' }).click()
    const close = page.getByRole('dialog', { name: 'Chốt quyết toán' })
    await expect(close.getByRole('status')).toContainText('Người ứng hoàn lại 50.000 đ')
    await snap(page, testInfo, 'closeAdvance', { fullPage: false })
    await close.getByRole('button', { name: 'Chốt quyết toán' }).click()
    await expect(toSettle.getByText(/Đã nhận lại 50.000 đ tiền thừa/)).toBeVisible()
    await expectNoHorizontalScroll(page)
    await snap(page, testInfo, 'advanceSettled', { fullPage: false })
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: /Hoàn tạm ứng: In băng rôn cho buổi biểu diễn/ })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Số dư Quỹ chung' }).getByText('5.170.000')).toBeVisible()
  })
})
