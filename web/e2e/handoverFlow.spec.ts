import { expect, test, type Page } from '@playwright/test'
import { expectNoHorizontalScroll, loginAs, openNavLink, openNotification, settleToast, snap, switchUser } from './helpers.ts'

const year = new Date().getFullYear() + 1
const nextTerm = { name: `Nhiệm kỳ ${year}–${year + 1}`, start: `01/09/${year}`, end: `31/08/${year + 1}` }

/** Khai báo nhiệm kỳ mới (sửa kế hoạch ban nếu cần) rồi bắt đầu bàn giao qua giao diện; dừng ở trang phiên bàn giao. */
async function startHandover(page: Page, editPlan?: (page: Page) => Promise<void>) {
  await page.goto('/clubs/c-guitar')
  await openNavLink(page, 'Nhiệm kỳ')
  await page.getByRole('button', { name: 'Khai báo nhiệm kỳ mới' }).click()
  const create = page.getByRole('dialog', { name: 'Khai báo nhiệm kỳ mới' })
  await create.getByRole('textbox', { name: 'Tên nhiệm kỳ' }).fill(nextTerm.name)
  await create.getByRole('textbox', { name: 'Ngày bắt đầu dự kiến' }).fill(nextTerm.start)
  await create.getByRole('textbox', { name: 'Ngày kết thúc' }).fill(nextTerm.end)
  await create.getByRole('button', { name: 'Khai báo', exact: true }).click()
  await expect(page.getByText(`Đã khai báo ${nextTerm.name} ở trạng thái Chuẩn bị.`)).toBeVisible()
  if (editPlan) await editPlan(page)

  await page.getByRole('region', { name: nextTerm.name }).getByRole('button', { name: 'Bắt đầu bàn giao' }).click()
  const confirm = page.getByRole('dialog', { name: 'Bắt đầu bàn giao' })
  await expect(confirm.getByText('Không quay lại trạng thái Đang chạy được.')).toBeVisible()
  await confirm.getByRole('button', { name: 'Bắt đầu bàn giao' }).click()
  await page.waitForURL('**/handovers/**')
  await expect(page.getByRole('heading', { name: 'Bàn giao nhiệm kỳ' })).toBeVisible()
}

/** Điền một dòng kết quả bầu mới ở cuối sheet. */
async function addAppointment(page: Page, role: string, person: string, department?: string) {
  const sheet = page.getByRole('dialog', { name: 'Kết quả bầu' })
  await sheet.getByRole('button', { name: 'Thêm người được bầu' }).click()
  const row = sheet.getByRole('listitem').last()
  await row.getByRole('combobox', { name: 'Chức vụ' }).selectOption({ label: role })
  if (department) await row.getByRole('combobox', { name: 'Ban' }).selectOption({ label: department })
  await row.getByRole('combobox', { name: 'Người được bầu' }).selectOption({ label: person })
}

test.describe('Bàn giao nhiệm kỳ', () => {
  test('ban chủ nhiệm bắt đầu bàn giao, ghi kết quả bầu; người được bầu mở thông báo', async ({ page }, testInfo) => {
    await loginAs(page, 'anh.nguyen@demo.test')
    await startHandover(page)
    await expect(page.getByText('Chưa ghi kết quả bầu')).toBeVisible()
    await expect(page.getByText('Chưa có Chủ nhiệm đủ điều kiện cho nhiệm kỳ mới.')).toBeVisible()

    await page.getByRole('button', { name: 'Sửa kết quả bầu' }).click()
    const sheet = page.getByRole('dialog', { name: 'Kết quả bầu' })
    await addAppointment(page, 'Chủ nhiệm', 'Đặng Khánh Linh · Ban Truyền thông')
    await addAppointment(page, 'Thủ quỹ', 'Võ Ngọc Mai · Ban Hậu cần')
    await addAppointment(page, 'Trưởng ban', 'Hoàng Thảo Vy · Ban Truyền thông', 'Truyền thông')
    // Trưởng ban chỉ chọn được người của chính ban đó (BR-ORG-01).
    await expect(sheet.getByRole('listitem').last().getByRole('combobox', { name: 'Người được bầu' }).getByRole('option', { name: /Lê Thu Hà/ })).toHaveCount(1)
    await expect(sheet.getByRole('listitem').last().getByRole('combobox', { name: 'Người được bầu' }).getByRole('option', { name: /Võ Ngọc Mai/ })).toHaveCount(0)
    await snap(page, testInfo, 'handoverAppointmentsSheet')
    await sheet.getByRole('button', { name: 'Lưu kết quả bầu' }).click()
    await expect(page.getByText('Đã lưu kết quả bầu.')).toBeVisible()

    const board = page.getByRole('list', { name: 'Ban chủ nhiệm mới' })
    await expect(board.getByRole('listitem')).toHaveCount(2)
    await expect(board.getByRole('listitem').first()).toContainText('Đặng Khánh Linh')
    await expect(page.getByRole('list', { name: 'Trưởng, phó ban' })).toContainText('Trưởng ban Truyền thông')
    // Kết quả bầu đã đủ; chỉ còn danh mục bàn giao chờ ban chủ nhiệm mới xác nhận (BR-TERM-03).
    await expect(page.getByText(/^Còn \d+ mục bàn giao chờ ban chủ nhiệm mới xác nhận\.$/)).toBeVisible()
    await expect(page.getByText('Chưa có Chủ nhiệm đủ điều kiện cho nhiệm kỳ mới.')).toHaveCount(0)
    await snap(page, testInfo, 'handoverPage')

    // Trong lúc bàn giao, Cơ cấu không còn nút gán chức vụ thường trực.
    await openNavLink(page, 'Cơ cấu')
    await expect(page.getByText(/CLB đang bàn giao nhiệm kỳ/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Gán chức vụ' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Thêm ban' })).toBeVisible()

    await switchUser(page, 'Nguyễn Minh Anh', 'linh.dang@demo.test')
    await openNotification(page, /Bạn được bầu làm Chủ nhiệm/)
    await page.waitForURL('**/handovers/**')
    await expect(page.getByRole('list', { name: 'Ban chủ nhiệm mới' })).toContainText('Đặng Khánh Linh')
    await expect(page.getByRole('button', { name: 'Sửa kết quả bầu' })).toHaveCount(0)
    await snap(page, testInfo, 'handoverAppointeeView')
  })

  test('ban chủ nhiệm mới xác nhận danh mục: quỹ, giữ và thay Trưởng BTC, cả trang công việc', async ({ page }, testInfo) => {
    await loginAs(page, 'anh.nguyen@demo.test')
    await startHandover(page)
    await page.getByRole('button', { name: 'Sửa kết quả bầu' }).click()
    await addAppointment(page, 'Chủ nhiệm', 'Đặng Khánh Linh · Ban Truyền thông')
    await page.getByRole('dialog', { name: 'Kết quả bầu' }).getByRole('button', { name: 'Lưu kết quả bầu' }).click()
    await expect(page.getByText('Đã lưu kết quả bầu.')).toBeVisible()
    // Ban chủ nhiệm cũ không xác nhận trực tiếp từng mục, chỉ có lối xác nhận thay (FR-TERM-07).
    const catalog = page.getByRole('region', { name: 'Danh mục bàn giao' })
    await expect(catalog.getByText('Quỹ chung')).toBeVisible()
    await expect(catalog.getByRole('button', { name: /^Xác nhận: / })).toHaveCount(0)
    await expect(catalog.getByRole('button', { name: 'Xác nhận thay' })).toBeVisible()

    await switchUser(page, 'Nguyễn Minh Anh', 'linh.dang@demo.test')
    await openNotification(page, /Bạn được bầu làm Chủ nhiệm/)
    await page.waitForURL('**/handovers/**')
    await expect(catalog.getByText(/^Đã xác nhận 0\/\d+ mục bàn giao/)).toBeVisible()

    await catalog.getByRole('button', { name: 'Xác nhận: Quỹ chung' }).click()
    await expect(page.getByText('Đã xác nhận mục bàn giao.')).toBeVisible()
    const general = catalog.getByRole('listitem').filter({ hasText: 'Quỹ chung' })
    await expect(general.getByText('Đã xác nhận', { exact: true })).toBeVisible()
    await expect(general.getByText(/^Xác nhận bởi Đặng Khánh Linh/)).toBeVisible()
    await snap(page, testInfo, 'handoverCatalog')

    await catalog.getByRole('tab', { name: /Sự kiện/ }).click()
    await catalog.getByRole('button', { name: 'Giữ hoặc thay Trưởng BTC: Đêm nhạc Mùa đông' }).click()
    const decision = page.getByRole('dialog', { name: 'Giữ hoặc thay Trưởng BTC' })
    await expect(decision.getByRole('radio', { name: /Giữ Trưởng BTC hiện tại/ })).toBeChecked()
    await decision.getByRole('button', { name: 'Xác nhận mục này' }).click()
    await expect(page.getByText('Đã xác nhận mục bàn giao.').first()).toBeVisible()
    await expect(catalog.getByRole('listitem').filter({ hasText: 'Đêm nhạc Mùa đông' }).getByText('Giữ Trưởng BTC Trần Quốc Bảo')).toBeVisible()

    await catalog.getByRole('button', { name: 'Giữ hoặc thay Trưởng BTC: Livestream hướng dẫn bấm hợp âm' }).click()
    await decision.getByRole('radio', { name: /Thay Trưởng BTC/ }).check()
    await decision.getByRole('combobox', { name: 'Trưởng BTC mới' }).selectOption({ label: 'Ngô Bảo Trâm · Ban Hậu cần' })
    await snap(page, testInfo, 'handoverLeadDialog')
    await decision.getByRole('button', { name: 'Xác nhận mục này' }).click()
    const livestream = catalog.getByRole('listitem').filter({ hasText: 'Livestream hướng dẫn bấm hợp âm' })
    await expect(livestream.getByText('Thay Trưởng BTC bằng Ngô Bảo Trâm')).toBeVisible()
    // Trưởng BTC cũ giữ chức tới khi bàn giao hoàn tất (BR-TERM-02).
    await expect(livestream.getByText('Lý Tuấn Kiệt')).toBeVisible()
    await expect(livestream.getByRole('button', { name: /^Đổi quyết định/ })).toBeVisible()

    await catalog.getByRole('tab', { name: /Công việc/ }).click()
    await catalog.getByRole('button', { name: 'Xác nhận các mục đang hiện' }).click()
    const batch = page.getByRole('dialog', { name: 'Xác nhận các mục đang hiện' })
    await batch.getByRole('button', { name: /^Xác nhận \d+ mục$/ }).click()
    await expect(page.getByText(/^Đã xác nhận \d+ mục bàn giao\.$/)).toBeVisible()
    await catalog.getByRole('button', { name: /^Chờ xác nhận/ }).click()
    await expect(catalog.getByText('Không có mục nào ở trạng thái này')).toBeVisible()
    await snap(page, testInfo, 'handoverCatalogTasks')
  })

  test('trọn luồng: ban chủ nhiệm mới xác nhận hết, ban chủ nhiệm cũ hoàn tất, cơ cấu đổi theo kết quả bầu', async ({ page }, testInfo) => {
    await loginAs(page, 'anh.nguyen@demo.test')
    await startHandover(page, async (current) => {
      await current.getByRole('region', { name: nextTerm.name }).getByRole('button', { name: 'Sửa kế hoạch ban' }).click()
      const plan = current.getByRole('dialog', { name: 'Kế hoạch ban' })
      await plan.getByRole('listitem').filter({ hasText: 'Truyền thông' }).getByRole('textbox', { name: 'Tên ban' }).fill('Truyền thông số')
      await plan.getByRole('button', { name: 'Thêm ban mới' }).click()
      await plan.getByRole('listitem').filter({ hasText: 'Ban mới 6' }).getByRole('textbox', { name: 'Tên ban' }).fill('Sự kiện')
      await plan.getByRole('button', { name: 'Lưu kế hoạch' }).click()
      await expect(current.getByText('Đã lưu kế hoạch ban.')).toBeVisible()
    })
    await page.getByRole('button', { name: 'Sửa kết quả bầu' }).click()
    await addAppointment(page, 'Chủ nhiệm', 'Đặng Khánh Linh · Ban Truyền thông')
    await addAppointment(page, 'Thủ quỹ', 'Võ Ngọc Mai · Ban Hậu cần')
    await addAppointment(page, 'Trưởng ban', 'Hoàng Thảo Vy · Ban Truyền thông', 'Truyền thông số')
    await page.getByRole('dialog', { name: 'Kết quả bầu' }).getByRole('button', { name: 'Lưu kết quả bầu' }).click()
    await expect(page.getByText('Đã lưu kết quả bầu.')).toBeVisible()
    // Còn mục chưa xác nhận thì hộp hoàn tất chỉ nêu lý do (BR-TERM-03).
    await page.getByRole('button', { name: 'Hoàn tất bàn giao' }).click()
    const completeDialog = page.getByRole('dialog', { name: 'Hoàn tất bàn giao' })
    await expect(completeDialog.getByText(/^Còn \d+ mục bàn giao chờ ban chủ nhiệm mới xác nhận\.$/)).toBeVisible()
    await expect(completeDialog.getByRole('button', { name: 'Hoàn tất bàn giao' })).toBeDisabled()
    await completeDialog.getByRole('button', { name: 'Hủy bỏ' }).click()

    await switchUser(page, 'Nguyễn Minh Anh', 'linh.dang@demo.test')
    await openNotification(page, /Bạn được bầu làm Chủ nhiệm/)
    await page.waitForURL('**/handovers/**')
    const catalog = page.getByRole('region', { name: 'Danh mục bàn giao' })
    const confirmPage = async () => {
      await catalog.getByRole('button', { name: 'Xác nhận các mục đang hiện' }).click()
      await page.getByRole('dialog', { name: 'Xác nhận các mục đang hiện' }).getByRole('button', { name: /^Xác nhận \d+ mục$/ }).click()
      await expect(catalog.getByRole('button', { name: 'Xác nhận các mục đang hiện' })).toHaveCount(0)
    }
    await confirmPage()
    await catalog.getByRole('tab', { name: /Sự kiện/ }).click()
    const decision = page.getByRole('dialog', { name: 'Giữ hoặc thay Trưởng BTC' })
    for (const event of ['Đêm nhạc Mùa đông', 'Workshop đệm hát cơ bản', 'Giao lưu guitar cùng CLB bạn', 'Livestream hướng dẫn bấm hợp âm']) {
      await catalog.getByRole('button', { name: `Giữ hoặc thay Trưởng BTC: ${event}` }).click()
      if (event.startsWith('Livestream')) {
        await decision.getByRole('radio', { name: /Thay Trưởng BTC/ }).check()
        await decision.getByRole('combobox', { name: 'Trưởng BTC mới' }).selectOption({ label: 'Ngô Bảo Trâm · Ban Hậu cần' })
      }
      await decision.getByRole('button', { name: 'Xác nhận mục này' }).click()
      await expect(decision).toHaveCount(0)
      await expect(catalog.getByRole('button', { name: `Giữ hoặc thay Trưởng BTC: ${event}` })).toHaveCount(0)
    }
    await confirmPage()
    await catalog.getByRole('tab', { name: /Công việc/ }).click()
    await confirmPage()
    await catalog.getByRole('tab', { name: /Tài liệu/ }).click()
    await confirmPage()
    await expect(catalog.getByText(/^Đã xác nhận đủ \d+ mục bàn giao\.$/)).toBeVisible()
    await expect(page.getByText('Kết quả bầu, kế hoạch ban và danh mục bàn giao đã đủ điều kiện.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Hoàn tất bàn giao' })).toHaveCount(0)

    await switchUser(page, 'Đặng Khánh Linh', 'anh.nguyen@demo.test')
    await openNavLink(page, 'Nhiệm kỳ')
    await expect(page.getByText(/^Đã xác nhận đủ \d+ mục bàn giao\.$/)).toBeVisible()
    await page.getByRole('link', { name: 'Mở phiên bàn giao' }).click()
    await page.getByRole('button', { name: 'Hoàn tất bàn giao' }).click()
    await expect(completeDialog.getByText('Đổi tên ban Truyền thông thành Truyền thông số.')).toBeVisible()
    await expect(completeDialog.getByText('Tạo ban mới Sự kiện.')).toBeVisible()
    await expect(completeDialog.getByText('Thay Trưởng BTC Livestream hướng dẫn bấm hợp âm: Lý Tuấn Kiệt thành Ngô Bảo Trâm.')).toBeVisible()
    await snap(page, testInfo, 'handoverCompleteDialog', { fullPage: false })
    await completeDialog.getByRole('button', { name: 'Hoàn tất bàn giao' }).click()
    await expect(page.getByText(`Đã hoàn tất bàn giao. ${nextTerm.name} bắt đầu từ hôm nay.`)).toBeVisible()
    await page.waitForURL('**/clubs/c-guitar/terms')
    const running = page.getByRole('region', { name: nextTerm.name })
    await expect(running.getByText('Đang chạy').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Khai báo nhiệm kỳ mới' })).toHaveCount(0)
    await snap(page, testInfo, 'termsAfterHandover')

    // Người không tái đắc cử mất nút quản lý; cơ cấu theo kết quả bầu và kế hoạch ban.
    await openNavLink(page, 'Cơ cấu')
    await expect(page.getByRole('button', { name: /^Ban Truyền thông số/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Ban Sự kiện/ })).toBeVisible()
    const board = page.getByRole('region', { name: 'Ban chủ nhiệm' })
    await expect(board.getByText('Đặng Khánh Linh')).toBeVisible()
    await expect(board.getByText(/^Chủ nhiệm · \d{2}\/\d{2}\/\d{4}/)).toBeVisible()
    await expect(board.getByText('Võ Ngọc Mai')).toBeVisible()
    await expect(board.getByText('Nguyễn Minh Anh')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Thêm ban' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Gán chức vụ' })).toHaveCount(0)
    await snap(page, testInfo, 'orgAfterHandover')
  })

  test('ban chủ nhiệm cũ xác nhận thay các mục khi người cũ không bàn giao; ban chủ nhiệm mới được báo', async ({ page }, testInfo) => {
    await loginAs(page, 'anh.nguyen@demo.test')
    await startHandover(page)
    await page.getByRole('button', { name: 'Sửa kết quả bầu' }).click()
    await addAppointment(page, 'Chủ nhiệm', 'Đặng Khánh Linh · Ban Truyền thông')
    await page.getByRole('dialog', { name: 'Kết quả bầu' }).getByRole('button', { name: 'Lưu kết quả bầu' }).click()
    await expect(page.getByText('Đã lưu kết quả bầu.')).toBeVisible()

    const catalog = page.getByRole('region', { name: 'Danh mục bàn giao' })
    await catalog.getByRole('tab', { name: /Tài liệu/ }).click()
    const documents = catalog.getByRole('listitem').filter({ hasText: 'Tài liệu Nhiệm kỳ 2026–2027' })
    await expect(documents.getByText('3 tài liệu')).toBeVisible()
    await catalog.getByRole('tab', { name: /Quỹ/ }).click()
    await catalog.getByRole('button', { name: 'Xác nhận thay' }).click()
    await expect(catalog.getByText(/^Đã chọn 0/)).toBeVisible()
    await catalog.getByRole('checkbox', { name: 'Chọn tất cả đang hiện' }).check()
    await expect(catalog.getByRole('checkbox', { name: 'Chọn để xác nhận thay: Quỹ chung' })).toBeChecked()
    await expectNoHorizontalScroll(page)
    await snap(page, testInfo, 'handoverSubstituteMode')
    const submit = catalog.getByRole('button', { name: /^Xác nhận thay \d+ mục$/ })
    const chosen = Number((await submit.textContent())?.match(/\d+/)?.[0] ?? 0)
    await submit.click()
    const dialog = page.getByRole('dialog', { name: /^Xác nhận thay \d+ mục$/ })
    await dialog.getByRole('textbox', { name: 'Lý do xác nhận thay' }).fill('Thủ quỹ cũ đã rời CLB, không liên lạc được.')
    await dialog.getByRole('button', { name: 'Xác nhận thay' }).click()
    await settleToast(page, chosen > 1 ? `Đã xác nhận thay ${chosen} mục bàn giao.` : 'Đã xác nhận thay mục bàn giao.')
    const general = catalog.getByRole('listitem').filter({ hasText: 'Quỹ chung' })
    await expect(general.getByText('Đã xác nhận', { exact: true })).toBeVisible()
    await expect(general.getByText(/^Xác nhận thay bởi Nguyễn Minh Anh: Thủ quỹ cũ đã rời CLB, không liên lạc được\./)).toBeVisible()
    await expect(catalog.getByRole('checkbox')).toHaveCount(0)
    await expectNoHorizontalScroll(page)
    await snap(page, testInfo, 'handoverSubstituted')

    await switchUser(page, 'Nguyễn Minh Anh', 'linh.dang@demo.test')
    await openNotification(page, /mục bàn giao được xác nhận thay/)
    await page.waitForURL('**/handovers/**')
    await expect(catalog.getByRole('listitem').filter({ hasText: 'Quỹ chung' }).getByText(/^Xác nhận thay bởi Nguyễn Minh Anh/)).toBeVisible()
  })

  test('thành viên thường không mở được phiên bàn giao', async ({ page }) => {
    await loginAs(page, 'anh.nguyen@demo.test')
    await startHandover(page)
    const handoverPath = new URL(page.url()).pathname
    await switchUser(page, 'Nguyễn Minh Anh', 'ha.le@demo.test')
    await openNavLink(page, 'Nhiệm kỳ')
    await expect(page.getByText('Đang bàn giao').first()).toBeVisible()
    // Mọi thành viên thấy tiến độ bàn giao (chỉ số đếm), không mở được danh mục.
    await expect(page.getByText(/^Đã xác nhận 0\/\d+ mục bàn giao, còn \d+ mục chờ\.$/)).toBeVisible()
    await expect(page.getByRole('link', { name: 'Mở phiên bàn giao' })).toHaveCount(0)
    await page.evaluate((path) => window.history.pushState({}, '', path), handoverPath)
    await page.evaluate(() => window.dispatchEvent(new PopStateEvent('popstate')))
    await expect(page.getByText('Chỉ ban chủ nhiệm hiện tại và người được bầu vào ban chủ nhiệm mới xem được phiên bàn giao.')).toBeVisible()
  })
})
