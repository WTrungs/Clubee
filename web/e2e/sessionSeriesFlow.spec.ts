import { expect, test } from '@playwright/test'
import { expectNoHorizontalScroll, loginAs, openNavLink, openNotification, snap, switchUser } from './helpers.ts'

const DAY_MS = 24 * 60 * 60 * 1000
/** Ngày dd/mm/yyyy theo giờ Việt Nam, cách hôm nay một số ngày. */
const vnDay = (days: number) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(Date.now() + days * DAY_MS))

test.describe('Chuỗi buổi sinh hoạt (FR-ATT-02)', () => {
  test('trưởng ban tạo chuỗi hằng tuần, sửa riêng một buổi rồi hủy, thành viên ban được báo', async ({ page }, testInfo) => {
    const title = `Họp ban hằng tuần ${testInfo.project.name}`
    await loginAs(page, 'linh.dang@demo.test')
    await page.goto('/clubs/c-guitar/sessions')
    await page.getByRole('button', { name: 'Tạo buổi' }).click()
    const sheet = page.getByRole('dialog', { name: 'Tạo buổi sinh hoạt' })
    await sheet.getByRole('textbox', { name: 'Tên buổi' }).fill(title)
    await sheet.getByRole('textbox', { name: 'Địa điểm' }).fill('Phòng truyền thông A2')
    await sheet.getByRole('combobox', { name: 'Lặp lại' }).selectOption('WEEKLY')
    // Buổi đầu mặc định cách hôm nay 7 ngày; đến ngày +28 là 4 buổi.
    await sheet.getByRole('textbox', { name: 'Đến ngày' }).fill(vnDay(28))
    await expect(sheet.getByRole('list', { name: 'Ngày các buổi trong chuỗi' }).getByRole('listitem')).toHaveCount(4)
    await snap(page, testInfo, 'sessionSeriesForm', { fullPage: false })
    await sheet.getByRole('button', { name: 'Tạo 4 buổi' }).click()

    await page.waitForURL(/\/clubs\/c-guitar\/sessions\/s-/)
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible()
    await expect(page.getByText('Buổi 1/4').first()).toBeVisible()
    await expectNoHorizontalScroll(page)

    await page.getByRole('button', { name: 'Sửa buổi' }).click()
    const edit = page.getByRole('dialog', { name: 'Sửa buổi sinh hoạt' })
    await expect(edit.getByText(/Chỉ sửa buổi này \(Buổi 1\/4 của chuỗi\)/)).toBeVisible()
    await expect(edit.getByRole('combobox', { name: 'Lặp lại' })).toHaveCount(0)
    await edit.getByRole('textbox', { name: 'Địa điểm' }).fill('Hội trường E')
    await snap(page, testInfo, 'sessionEdit', { fullPage: false })
    await edit.getByRole('button', { name: 'Lưu thay đổi' }).click()
    await expect(edit).toBeHidden()
    await expect(page.getByText('Hội trường E').first()).toBeVisible()

    await page.getByRole('button', { name: 'Hủy buổi' }).click()
    const cancel = page.getByRole('dialog', { name: 'Hủy buổi sinh hoạt?' })
    await expect(cancel.getByText(/các buổi khác trong chuỗi giữ nguyên/)).toBeVisible()
    await cancel.getByRole('textbox').fill('Phòng bị trưng dụng thi cuối kỳ.')
    await cancel.getByRole('button', { name: 'Hủy buổi' }).click()
    await expect(cancel).toBeHidden()
    await expect(page.getByText(/Buổi đã hủy lúc .* bởi Đặng Khánh Linh/)).toBeVisible()
    await expect(page.getByText('Lý do: Phòng bị trưng dụng thi cuối kỳ.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sửa buổi' })).toHaveCount(0)
    await expect(page.getByRole('tab', { name: 'Điểm danh' })).toHaveCount(0)
    await snap(page, testInfo, 'sessionCancelled')

    await openNavLink(page, 'Sinh hoạt')
    const cards = page.getByRole('link', { name: new RegExp(title) })
    await expect(cards).toHaveCount(4)
    await expect(cards.first().getByText('Đã hủy')).toBeVisible()
    await expect(cards.nth(1).getByText('Buổi 2/4')).toBeVisible()
    await expect(cards.nth(1).getByText('Sắp diễn ra')).toBeVisible()
    await expectNoHorizontalScroll(page)
    await snap(page, testInfo, 'sessionSeriesList')

    await switchUser(page, 'Đặng Khánh Linh', 'ha.le@demo.test')
    await openNotification(page, new RegExp(`Buổi sinh hoạt bị hủy: ${title}`))
    await page.waitForURL(/\/clubs\/c-guitar\/sessions\/s-/)
    await expect(page.getByText('Lý do: Phòng bị trưng dụng thi cuối kỳ.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Hủy buổi' })).toHaveCount(0)
  })
})
