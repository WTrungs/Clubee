import type { Tone } from '@/shared/ui/tone'
import type { ClubStatus, ClubTransitionAction } from '../model/clubTypes'

export const clubStatusDisplay: Record<ClubStatus, { label: string; tone: Tone }> = {
  ACTIVE: { label: 'Hoạt động', tone: 'success' },
  SUSPENDED: { label: 'Tạm ngừng', tone: 'warning' },
  DISSOLVED: { label: 'Đã giải thể', tone: 'neutral' },
}

export const clubTransitionDisplay: Record<ClubTransitionAction, { label: string; hint: string; confirm: string; done: string }> = {
  SUSPEND: {
    label: 'Tạm ngừng',
    hint: 'Không tạo buổi sinh hoạt, sự kiện, đợt tuyển mới; việc đang chạy vẫn tiếp tục. CLB ẩn khỏi danh bạ công khai.',
    confirm: 'Tạm ngừng CLB',
    done: 'Đã tạm ngừng CLB.',
  },
  REACTIVATE: {
    label: 'Hoạt động lại',
    hint: 'CLB tạo được hoạt động mới và hiện lại trên danh bạ công khai.',
    confirm: 'Cho hoạt động lại',
    done: 'CLB đã hoạt động trở lại.',
  },
  DISSOLVE: {
    label: 'Giải thể',
    hint: 'Mọi dữ liệu của CLB chỉ còn để xem. Đợt tuyển thôi nhận đơn, yêu cầu gia nhập đang chờ bị từ chối. Không hoàn tác được.',
    confirm: 'Giải thể CLB',
    done: 'Đã giải thể CLB.',
  },
}

/** ST-CLB: thao tác hợp lệ theo trạng thái hiện tại. */
export const CLUB_TRANSITIONS_FROM: Record<ClubStatus, ClubTransitionAction[]> = {
  ACTIVE: ['SUSPEND', 'DISSOLVE'],
  SUSPENDED: ['REACTIVATE', 'DISSOLVE'],
  DISSOLVED: [],
}

/** Câu giải thích ở băng đầu trang của CLB không còn Hoạt động. */
export const clubStatusNotice: Record<Exclude<ClubStatus, 'ACTIVE'>, { title: string; body: string }> = {
  SUSPENDED: { title: 'CLB đang tạm ngừng', body: 'Không tạo được buổi sinh hoạt, sự kiện, đợt tuyển mới. Việc đang chạy vẫn tiếp tục.' },
  DISSOLVED: { title: 'CLB đã giải thể', body: 'Dữ liệu của CLB chỉ còn để xem, không thay đổi được nữa.' },
}

/** Giải thể phải gõ đúng tên viết tắt để tránh bấm nhầm; không phân biệt hoa thường. */
export const confirmsShortName = (typed: string, shortName: string) => typed.trim().toLocaleUpperCase('vi') === shortName.trim().toLocaleUpperCase('vi')
