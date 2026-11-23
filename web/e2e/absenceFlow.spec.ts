import { expect, test } from '@playwright/test'
import { expectNoHorizontalScroll, loginAs, openNotification, settleToast, snap, switchUser } from './helpers.ts'

const TITLE = 'Tập dượt tiết mục Đêm nhạc Mùa đông'

test.describe('Xin phép vắng (FR-ATT-04)', () => {
  test('thành viên gửi đơn, người phụ trách duyệt một đơn và từ chối một đơn kèm lý do, người gửi được báo', async ({ page }, testInfo) => {
    await loginAs(page, 'bao.tran@demo.test')
    // Chưa ghi gì nên tải trang được; từ đây chỉ đi bằng thông báo để dữ liệu mock còn nguyên.
    await page.goto('/clubs/c-guitar/sessions/s-music-rehearsal')
    await expect(page.getByRole('heading', { name: TITLE, level: 1 })).toBeVisible()
    const card = page.getByRole('region', { name: 'Xin phép vắng' })
    await card.getByRole('button', { name: 'Xin phép vắng' }).click()
    const dialog = page.getByRole('dialog', { name: 'Xin phép vắng buổi này?' })
    await dialog.getByRole('textbox').fill('Trùng lịch thực tập ở công ty.')
    await snap(page, testInfo, 'absenceRequest', { fullPage: false })
    await dialog.getByRole('button', { name: 'Gửi đơn' }).click()
    await settleToast(page, 'Đã gửi đơn xin phép. Bạn sẽ được báo khi có kết quả.')
    await expect(card.getByText('Chờ duyệt')).toBeVisible()
    await expect(card.getByRole('button', { name: 'Rút đơn' })).toBeVisible()
    await expectNoHorizontalScroll(page)

    await switchUser(page, 'Trần Quốc Bảo', 'anh.nguyen@demo.test')
    await openNotification(page, new RegExp(`Đơn xin phép vắng: ${TITLE}`))
    await expect(page.getByRole('heading', { name: TITLE, level: 1 })).toBeVisible()
    await page.getByRole('tab', { name: 'Xin phép (2)' }).click()
    await page.getByRole('button', { name: 'Duyệt đơn của Đỗ Nhật Nam' }).click()
    await settleToast(page, 'Đã duyệt đơn của Đỗ Nhật Nam.')
    await page.getByRole('button', { name: 'Từ chối đơn của Trần Quốc Bảo' }).click()
    const reject = page.getByRole('dialog', { name: 'Từ chối đơn xin phép?' })
    await reject.getByRole('textbox').fill('Buổi này chạy thử toàn bộ tiết mục.')
    await reject.getByRole('button', { name: 'Từ chối' }).click()
    await settleToast(page, 'Đã từ chối đơn của Trần Quốc Bảo.')
    await expect(page.getByRole('tab', { name: 'Xin phép', exact: true })).toBeVisible()
    await expect(page.getByText('Bị từ chối')).toBeVisible()
    await expectNoHorizontalScroll(page)
    await snap(page, testInfo, 'absenceRequests')

    await page.getByRole('tab', { name: 'Điểm danh' }).click()
    await expect(page.getByText('Có đơn đã duyệt')).toBeVisible()

    await switchUser(page, 'Nguyễn Minh Anh', 'bao.tran@demo.test')
    await openNotification(page, new RegExp(`Đơn xin phép bị từ chối: ${TITLE}`))
    const mine = page.getByRole('region', { name: 'Xin phép vắng' })
    await expect(mine.getByText('Bị từ chối')).toBeVisible()
    await expect(mine.getByText(/Lý do: Buổi này chạy thử toàn bộ tiết mục\./)).toBeVisible()
    await expect(mine.getByRole('button', { name: 'Gửi đơn mới' })).toBeVisible()
    await snap(page, testInfo, 'absenceRejected')
  })
})
