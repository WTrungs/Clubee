import { expect, test, type Page } from '@playwright/test'
import { loginAs, openNavLink, settleToast, snap, switchUser, useDarkTheme } from './helpers.ts'

const column = (page: Page, label: string) => page.getByRole('region', { name: new RegExp(`^Cột ${label},`) })

test.describe('Công việc', () => {
  test('bảng Kanban, chi tiết và danh sách', async ({ page }, testInfo) => {
    await loginAs(page, 'ha.le@demo.test')
    await page.goto('/me/tasks')
    await expect(page.getByRole('heading', { name: 'Công việc của tôi' })).toBeVisible()
    await expect(page.getByText('Thiết kế poster Đêm nhạc Mùa đông').first()).toBeVisible()
    await snap(page, testInfo, 'myTasksBoard')

    await page.getByRole('button', { name: 'Thiết kế poster Đêm nhạc Mùa đông', exact: true }).click()
    const detail = page.getByRole('dialog', { name: 'Thiết kế poster Đêm nhạc Mùa đông' })
    await expect(detail).toBeVisible()
    await expect(detail.getByText('Bạn là người chính')).toBeVisible()
    await snap(page, testInfo, 'taskDetail')
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: 'Danh sách' }).click()
    await expect(page.getByRole('navigation', { name: 'Phân trang' })).toBeVisible()
    await snap(page, testInfo, 'myTasksList')
  })

  test('chuyển trạng thái bằng menu thao tác (không cần kéo thả)', async ({ page }, testInfo) => {
    await loginAs(page, 'ha.le@demo.test')
    await page.goto('/me/tasks')
    if (testInfo.project.name === 'mobile360') {
      // Màn hẹp chỉ hiện một cột, mặc định Đang làm, còn việc này ở cột Mới giao.
      await page.getByRole('group', { name: 'Chọn cột trạng thái' }).getByRole('button', { name: /^Mới giao/ }).click()
    }
    await page.getByRole('button', { name: 'Thao tác với “Viết bài giới thiệu thành viên mới”' }).click()
    await page.getByRole('menuitem', { name: 'Bắt đầu làm' }).click()
    await expect(page.getByText('Đã chuyển việc sang Đang làm.')).toBeVisible()
    if (testInfo.project.name === 'desktop1440') {
      await expect(column(page, 'Đang làm').getByText('Viết bài giới thiệu thành viên mới')).toBeVisible()
    }
  })

  test('kéo thả sang Chờ nghiệm thu mở hộp thoại nộp kết quả', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop1440', 'Kéo thả chỉ có ở màn rộng; màn hẹp dùng menu thao tác')
    await loginAs(page, 'ha.le@demo.test')
    await page.goto('/me/tasks')
    const card = column(page, 'Đang làm').getByText('Thiết kế poster Đêm nhạc Mùa đông')
    const target = column(page, 'Chờ nghiệm thu')
    const from = await card.boundingBox()
    const to = await target.boundingBox()
    if (!from || !to) throw new Error('Không tìm thấy vị trí thẻ hoặc cột')
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(from.x + from.width / 2 + 30, from.y + from.height / 2, { steps: 5 })
    await page.mouse.move(to.x + to.width / 2, to.y + 120, { steps: 15 })
    await snap(page, testInfo, 'taskDragging', { fullPage: false })
    await page.mouse.up()

    const dialog = page.getByRole('dialog', { name: 'Nộp kết quả' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Nộp kết quả' }).click()
    await expect(dialog.getByText('Nhập ghi chú hoặc đính kèm ít nhất một tệp kết quả.')).toBeVisible()
    await dialog.getByRole('textbox', { name: 'Ghi chú kết quả' }).fill('Đã xong bản A3 và bản đăng fanpage.')
    await dialog.getByRole('button', { name: 'Nộp kết quả' }).click()
    await expect(page.getByText('Đã nộp kết quả, chờ người giao nghiệm thu.')).toBeVisible()
    await expect(column(page, 'Chờ nghiệm thu').getByText('Thiết kế poster Đêm nhạc Mùa đông')).toBeVisible()
  })

  test('trưởng ban giao việc trong phạm vi của mình', async ({ page }, testInfo) => {
    await loginAs(page, 'anh.nguyen@demo.test')
    await page.goto('/clubs/c-guitar/tasks')
    await page.getByRole('button', { name: 'Giao việc' }).click()
    const sheet = page.getByRole('dialog', { name: 'Giao việc' })
    await expect(sheet.getByText('CLB hiện hành: CLB Guitar Sinh viên')).toBeVisible()
    await sheet.getByRole('textbox', { name: 'Tên việc' }).fill('Chuẩn bị bảng tên cho BTC')
    await sheet.getByRole('combobox', { name: 'Thuộc ban / tiểu ban' }).selectOption({ label: 'Ban Hậu cần' })
    await sheet.getByRole('combobox', { name: 'Người chính' }).selectOption({ label: 'Võ Ngọc Mai' })
    await sheet.getByRole('button', { name: 'Bùi Đức Long' }).click()
    await sheet.getByRole('button', { name: '1 tuần' }).click()
    await snap(page, testInfo, 'assignTask')
    await sheet.getByRole('button', { name: 'Giao việc' }).click()
    await expect(page.getByText('Đã giao “Chuẩn bị bảng tên cho BTC” cho Võ Ngọc Mai.')).toBeVisible()
    await expect(page.getByText('Chuẩn bị bảng tên cho BTC').first()).toBeVisible()
  })

  test('người giao đổi hạn, đổi người chính, hủy việc; người mới thấy việc của mình', async ({ page }, testInfo) => {
    const narrow = testInfo.project.name === 'mobile360'
    const showColumn = async (label: string) => {
      if (narrow) await page.getByRole('group', { name: 'Chọn cột trạng thái' }).getByRole('button', { name: new RegExp(`^${label}`) }).click()
    }
    const openTask = async (title: string) => {
      await page.getByRole('button', { name: title, exact: true }).click()
      return page.getByRole('dialog', { name: title })
    }
    const nextDue = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' }).format(
      new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    )

    await loginAs(page, 'linh.dang@demo.test')
    await page.goto('/clubs/c-guitar/tasks')
    await showColumn('Mới giao')
    let detail = await openTask('Quay video teaser 30 giây')
    await detail.getByRole('button', { name: 'Thao tác khác' }).click()
    await page.getByRole('menuitem', { name: 'Đổi hạn' }).click()
    const due = page.getByRole('dialog', { name: 'Đổi hạn' })
    await due.getByRole('textbox', { name: 'Hạn mới', exact: true }).fill(nextDue)
    await due.getByRole('textbox', { name: 'Lý do' }).fill('Phòng tập bận tuần này.')
    await snap(page, testInfo, 'taskChangeDue', { fullPage: false })
    await due.getByRole('button', { name: 'Lưu hạn mới' }).click()
    await settleToast(page, 'Đã đổi hạn công việc.')
    await expect(detail.getByText(new RegExp(`đổi hạn từ .+ thành ${nextDue}`))).toBeVisible()
    await page.keyboard.press('Escape')

    detail = await openTask('Viết bài giới thiệu thành viên mới')
    await detail.getByRole('button', { name: 'Thao tác khác' }).click()
    await page.getByRole('menuitem', { name: 'Đổi người làm' }).click()
    const reassign = page.getByRole('dialog', { name: 'Đổi người làm' })
    await reassign.getByRole('combobox', { name: 'Người chính' }).selectOption({ label: 'Hoàng Thảo Vy' })
    await reassign.getByRole('textbox', { name: 'Lý do' }).fill('Hà đang làm poster.')
    await snap(page, testInfo, 'taskReassign', { fullPage: false })
    await reassign.getByRole('button', { name: 'Lưu người làm' }).click()
    await settleToast(page, 'Đã đổi người làm công việc.')
    await expect(detail.getByText('đổi người chính từ Lê Thu Hà thành Hoàng Thảo Vy', { exact: false })).toBeVisible()
    await snap(page, testInfo, 'taskChangeHistory')
    await page.keyboard.press('Escape')

    await showColumn('Chờ nghiệm thu')
    detail = await openTask('Cập nhật ảnh bìa fanpage')
    await detail.getByRole('button', { name: 'Thao tác khác' }).click()
    await page.getByRole('menuitem', { name: 'Hủy việc' }).click()
    const cancel = page.getByRole('dialog', { name: 'Hủy việc' })
    await cancel.getByRole('textbox', { name: 'Lý do hủy' }).fill('Đổi chủ đề ảnh bìa sang năm mới.')
    await cancel.getByRole('button', { name: 'Hủy việc' }).click()
    await settleToast(page, 'Đã hủy việc.')
    await expect(detail.getByRole('heading', { name: 'Lý do hủy' })).toBeVisible()
    await page.keyboard.press('Escape')

    await switchUser(page, 'Đặng Khánh Linh', 'vy.hoang@demo.test')
    await openNavLink(page, 'Công việc của tôi')
    await page.getByRole('button', { name: 'Danh sách' }).click()
    await expect(page.getByText('Viết bài giới thiệu thành viên mới').first()).toBeVisible()
  })

  test('việc quá hạn có cờ, chi tiết ghi các mốc quá hạn', async ({ page }, testInfo) => {
    await loginAs(page, 'ha.le@demo.test')
    await page.goto('/me/tasks')
    await page.getByRole('button', { name: 'Dịch phụ đề clip biểu diễn', exact: true }).click()
    const detail = page.getByRole('dialog', { name: 'Dịch phụ đề clip biểu diễn' })
    await expect(detail.getByText('(quá hạn)')).toBeAttached()
    await expect(detail.getByText('Từng quá hạn 1 lần; đổi hạn không xóa các mốc này.')).toBeVisible()
    await expect(detail.getByText(/^Hệ thống ghi nhận quá hạn \(hạn \d{2}\/\d{2}\/\d{4} 21:00\)$/)).toBeVisible()
    await snap(page, testInfo, 'taskOverdueHistory')
    await page.keyboard.press('Escape')

    // Việc hạn ngày mai nằm trong khoảng nhắc 1 ngày của CLB.
    await page.getByRole('button', { name: 'Danh sách' }).click()
    await expect(page.getByText('Sắp đến hạn', { exact: true }).first()).toBeVisible()
  })

  test('thành viên thường không thấy nút giao việc', async ({ page }) => {
    await loginAs(page, 'ha.le@demo.test')
    await page.goto('/clubs/c-guitar/tasks')
    await expect(page.getByRole('heading', { name: 'Công việc' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Giao việc' })).toHaveCount(0)
  })

  test('giao diện tối', async ({ page }, testInfo) => {
    await useDarkTheme(page)
    await loginAs(page, 'bao.tran@demo.test')
    await page.goto('/me/tasks')
    await expect(page.getByText('Soạn hợp âm bài mở màn').first()).toBeVisible()
    await snap(page, testInfo, 'myTasksDark')
  })

  test('khối lượng việc theo người: chủ nhiệm xem toàn CLB và từng ban, trưởng ban chỉ thấy ban mình (FR-TASK-08)', async ({ page }, testInfo) => {
    await loginAs(page, 'anh.nguyen@demo.test')
    await page.goto('/clubs/c-guitar/tasks')
    await page.getByRole('tab', { name: 'Khối lượng theo người' }).click()
    const club = page.getByRole('region', { name: 'Khối lượng việc: Toàn CLB' })
    await expect(club).toBeVisible()
    await expect(club.getByText('Đặng Khánh Linh').filter({ visible: true }).first()).toBeVisible()
    await snap(page, testInfo, 'workloadClub')
    await page.getByRole('combobox', { name: 'Phạm vi' }).selectOption({ label: 'Ban Truyền thông' })
    await expect(page.getByRole('region', { name: 'Khối lượng việc: Ban Truyền thông' })).toBeVisible()
    await page.getByRole('combobox', { name: 'Phạm vi' }).selectOption({ label: 'Sự kiện Đêm nhạc Mùa đông' })
    const winter = page.getByRole('region', { name: 'Khối lượng việc: Sự kiện Đêm nhạc Mùa đông' })
    await expect(winter.getByText('Trưởng BTC').filter({ visible: true }).first()).toBeVisible()
    await snap(page, testInfo, 'workloadEvent')

    await switchUser(page, 'Nguyễn Minh Anh', 'linh.dang@demo.test')
    await openNavLink(page, 'Công việc')
    await page.getByRole('tab', { name: 'Khối lượng theo người' }).click()
    await expect(page.getByRole('region', { name: 'Khối lượng việc: Ban Truyền thông' })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Phạm vi' })).toHaveCount(0)

    await switchUser(page, 'Đặng Khánh Linh', 'ha.le@demo.test')
    await openNavLink(page, 'Công việc')
    await expect(page.getByRole('heading', { name: 'Công việc', level: 1 })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Khối lượng theo người' })).toHaveCount(0)
  })
})
