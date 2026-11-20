/** Tài khoản demo chỉ hiện khi chạy mock, để thử giao diện theo từng vai trò. Không chứa mật khẩu. */
export interface DemoAccount {
  email: string
  fullName: string
  roleLabel: string
  description: string
}

export const demoAccounts: DemoAccount[] = [
  {
    email: 'anh.nguyen@demo.test',
    fullName: 'Nguyễn Minh Anh',
    roleLabel: 'Chủ nhiệm',
    description: 'Ban chủ nhiệm CLB Guitar: tạo, duyệt sự kiện, giao việc.',
  },
  {
    email: 'mai.vo@demo.test',
    fullName: 'Võ Ngọc Mai',
    roleLabel: 'Thủ quỹ',
    description: 'Ban chủ nhiệm CLB Guitar: ghi khoản thu, ghi sổ khoản chi đã duyệt.',
  },
  {
    email: 'bao.tran@demo.test',
    fullName: 'Trần Quốc Bảo',
    roleLabel: 'Trưởng BTC',
    description: 'Phụ trách một sự kiện: lập tiểu ban, mời nhân sự, mở đăng ký.',
  },
  {
    email: 'ha.le@demo.test',
    fullName: 'Lê Thu Hà',
    roleLabel: 'Thành viên',
    description: 'Nhận và nộp việc, đề xuất sự kiện, đăng ký tham dự.',
  },
]
