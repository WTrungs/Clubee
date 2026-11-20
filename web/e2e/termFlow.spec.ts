import { expect, test } from '@playwright/test'
import { loginAs, openNavLink, snap, useDarkTheme } from './helpers.ts'

// Ngày tính theo năm hiện tại để test không hết hạn theo thời gian.
const year = new Date().getFullYear() + 1
const nextTerm = { name: `Nhiệm kỳ ${year}–${year + 1}`, start: `01/09/${year}`, end: `31/08/${year + 1}` }

test.describe('Nhiệm kỳ', () => {
  test('ban chủ nhiệm khai báo nhiệm kỳ mới rồi sửa kế hoạch ban', async ({ page }, testInfo) => {
    await loginAs(page, 'anh.nguyen@demo.test')
    await page.goto('/clubs/c-guitar')
    await openNavLink(page, 'Nhiệm kỳ')
    const current = page.getByRole('region', { name: 'Nhiệm kỳ 2026–2027' })
    await expect(current.getByText('Đang chạy').first()).toBeVisible()
    await expect(page.getByText('Chưa có nhiệm kỳ kế tiếp.', { exact: false })).toBeVisible()

    await page.getByRole('button', { name: 'Khai báo nhiệm kỳ mới' }).click()
    const create = page.getByRole('dialog', { name: 'Khai báo nhiệm kỳ mới' })
    await create.getByRole('textbox', { name: 'Tên nhiệm kỳ' }).fill('Nhiệm kỳ 2026–2027')
    await create.getByRole('textbox', { name: 'Ngày bắt đầu dự kiến' }).fill(nextTerm.start)
    await create.getByRole('textbox', { name: 'Ngày kết thúc' }).fill(nextTerm.start)
    await create.getByRole('button', { name: 'Khai báo', exact: true }).click()
    await expect(create.getByText('Ngày kết thúc phải sau ngày bắt đầu.')).toBeVisible()
    await create.getByRole('textbox', { name: 'Ngày kết thúc' }).fill(nextTerm.end)
    await create.getByRole('button', { name: 'Khai báo', exact: true }).click()
    // Trùng tên chỉ máy chủ biết, nên lỗi về từ máy chủ và gắn đúng ô.
    await expect(create.getByText('CLB đã có nhiệm kỳ trùng tên.')).toBeVisible()
    await create.getByRole('textbox', { name: 'Tên nhiệm kỳ' }).fill(nextTerm.name)
    await create.getByRole('button', { name: 'Khai báo', exact: true }).click()
    await expect(page.getByText(`Đã khai báo ${nextTerm.name} ở trạng thái Chuẩn bị.`)).toBeVisible()

    const preparing = page.getByRole('region', { name: nextTerm.name })
    await expect(preparing.getByText('Giữ 5 ban')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Khai báo nhiệm kỳ mới' })).toHaveCount(0)
    await snap(page, testInfo, 'termsPreparing')

    await preparing.getByRole('button', { name: 'Sửa kế hoạch ban' }).click()
    const plan = page.getByRole('dialog', { name: 'Kế hoạch ban' })
    const media = plan.getByRole('listitem').filter({ hasText: 'Truyền thông' })
    await expect(media.getByRole('switch', { name: /Bỏ ban khi bàn giao xong/ })).toBeDisabled()
    await expect(media.getByText(/còn \d+ thành viên có ban chính là ban này nên chưa bỏ được/)).toBeVisible()
    await media.getByRole('textbox', { name: 'Tên ban' }).fill('Truyền thông – Nội dung')
    await plan.getByRole('button', { name: 'Thêm ban mới' }).click()
    const fresh = plan.getByRole('listitem').filter({ hasText: 'Ban mới 6' })
    await expect(fresh.getByRole('textbox', { name: 'Tên ban' })).toBeFocused()
    await fresh.getByRole('textbox', { name: 'Tên ban' }).fill('Hậu cần')
    await plan.getByRole('button', { name: 'Lưu kế hoạch' }).click()
    await expect(fresh.getByText('Kế hoạch đã có ban trùng tên.')).toBeVisible()
    await fresh.getByRole('textbox', { name: 'Tên ban' }).fill('Sự kiện')
    await expect(plan.getByText('Giữ 5 ban · đổi tên 1 · thêm 1')).toBeVisible()
    await snap(page, testInfo, 'termsPlanSheet')
    await plan.getByRole('button', { name: 'Lưu kế hoạch' }).click()
    await expect(page.getByText('Đã lưu kế hoạch ban.')).toBeVisible()

    await expect(preparing.getByText('Giữ 5 ban · đổi tên 1 · thêm 1')).toBeVisible()
    const planList = preparing.getByRole('list', { name: 'Kế hoạch ban' })
    await expect(planList.getByRole('listitem').filter({ hasText: 'Truyền thông – Nội dung' })).toContainText('Đổi tên')
    await expect(planList.getByRole('listitem').filter({ hasText: 'Sự kiện' })).toContainText('Ban mới')

    // Kế hoạch chưa đổi cơ cấu đang chạy.
    await openNavLink(page, 'Cơ cấu')
    await expect(page.getByRole('button', { name: /^Ban Truyền thông \d+ người/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Ban Sự kiện/ })).toHaveCount(0)
  })

  test('thành viên thường chỉ xem, không có nút khai báo', async ({ page }, testInfo) => {
    await loginAs(page, 'ha.le@demo.test')
    await page.goto('/clubs/c-guitar')
    await openNavLink(page, 'Nhiệm kỳ')
    await expect(page.getByRole('region', { name: 'Nhiệm kỳ 2026–2027' })).toBeVisible()
    // Thành viên thường không thấy câu gợi ý khai báo dành cho ban chủ nhiệm.
    await expect(page.getByText(/^Chưa có nhiệm kỳ kế tiếp\. Nhiệm kỳ hiện tại kết thúc ngày \d{2}\/\d{2}\/\d{4}\.$/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Khai báo nhiệm kỳ mới' })).toHaveCount(0)
    await snap(page, testInfo, 'termsMemberView')

    // FR-ORG-06: từ nhiệm kỳ đã qua mở thẳng tab Chức vụ của nhiệm kỳ đó.
    const past = page.getByRole('region', { name: 'Nhiệm kỳ đã qua' })
    await expect(past.getByText('Nhiệm kỳ 2025–2026')).toBeVisible()
    await past.getByRole('link', { name: 'Xem chức vụ Nhiệm kỳ 2025–2026' }).click()
    await expect(page.getByRole('tab', { name: 'Chức vụ', selected: true })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Nhiệm kỳ' })).toHaveValue('t-guitar-2025')
    await expect(page.getByText('Tên ban theo lúc nhiệm kỳ đóng', { exact: false })).toBeVisible()
    await expect(page.getByText('Truyền thông và Sự kiện').first()).toBeVisible()
  })

  test('giao diện tối', async ({ page }, testInfo) => {
    await useDarkTheme(page)
    await loginAs(page, 'anh.nguyen@demo.test')
    await page.goto('/clubs/c-guitar/terms')
    await expect(page.getByRole('region', { name: 'Nhiệm kỳ 2026–2027' })).toBeVisible()
    await snap(page, testInfo, 'termsDark')
  })
})
