import { expect, test, type Page } from '@playwright/test'
import { expectNoHorizontalScroll, loginAs, openNavLink, openNotification, settleToast, snap, switchUser } from './helpers.ts'

const PLAN = 'Lên kế hoạch truyền thông Đêm nhạc Mùa đông'

async function openPlan(page: Page) {
  await openNavLink(page, 'Sinh hoạt')
  await page.getByRole('link', { name: new RegExp(PLAN) }).click()
  await expect(page.getByRole('heading', { name: PLAN, level: 1 })).toBeVisible()
}

test.describe('Đăng ký buổi giới hạn chỗ (FR-ATT-03)', () => {
  test('buổi đã kín thì vào danh sách chờ, có người hủy thì được đôn và được báo', async ({ page }, testInfo) => {
    await loginAs(page, 'ha.le@demo.test')
    // Chưa ghi gì nên tải trang được; từ đây chỉ đi bằng menu để dữ liệu mock còn nguyên.
    await page.goto('/clubs/c-guitar/sessions/s-media-plan')
    await expect(page.getByRole('heading', { name: PLAN, level: 1 })).toBeVisible()
    const seats = page.getByRole('region', { name: 'Đăng ký chỗ' })
    await expect(seats.getByText('Đã hết chỗ, đăng ký mới vào danh sách chờ')).toBeVisible()
    await seats.getByRole('button', { name: 'Vào danh sách chờ' }).click()
    await settleToast(page, 'Đã vào danh sách chờ, vị trí 1.')
    await expect(seats.getByText('Danh sách chờ · #1')).toBeVisible()
    await expectNoHorizontalScroll(page)
    await snap(page, testInfo, 'sessionWaitlisted')

    await switchUser(page, 'Lê Thu Hà', 'vy.hoang@demo.test')
    await openPlan(page)
    await page.getByRole('region', { name: 'Đăng ký chỗ' }).getByRole('button', { name: 'Hủy đăng ký' }).click()
    const confirm = page.getByRole('dialog', { name: 'Hủy đăng ký?' })
    await expect(confirm.getByText(/người đầu danh sách chờ được nhận chỗ thay/)).toBeVisible()
    await confirm.getByRole('button', { name: 'Hủy đăng ký' }).click()
    await settleToast(page, 'Đã hủy đăng ký.')

    await switchUser(page, 'Hoàng Thảo Vy', 'linh.dang@demo.test')
    await openPlan(page)
    await page.getByRole('tab', { name: 'Đăng ký' }).click()
    const list = page.getByRole('region', { name: 'Danh sách đăng ký' })
    await expect(list.getByText('Lê Thu Hà')).toBeVisible()
    await expect(list.getByText(/được đôn lúc/)).toBeVisible()
    await expect(list.getByText('Hoàng Thảo Vy')).toHaveCount(0)
    await expectNoHorizontalScroll(page)
    await snap(page, testInfo, 'sessionRegistrations')

    await switchUser(page, 'Đặng Khánh Linh', 'ha.le@demo.test')
    await openNotification(page, new RegExp(`Bạn đã được nhận chỗ: ${PLAN}`))
    await expect(page.getByRole('heading', { name: PLAN, level: 1 })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Đăng ký chỗ' }).getByText('Nhận chỗ', { exact: true })).toBeVisible()
    await snap(page, testInfo, 'sessionSeatTaken')
  })
})
