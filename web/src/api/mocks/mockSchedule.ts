/** Việc chạy theo giờ của mock (nhắc hạn, quá hạn, hết hạn xác nhận); máy chủ thật dùng lịch chạy định kỳ. */
type Job = () => void

/** Người gửi của thông báo tự động; không trùng người dùng nào nên không bị bỏ khỏi danh sách nhận. */
export const SYSTEM_ACTOR = 'system'

const jobs = new Map<string, Job>()
let running = false

/** Đăng ký một việc theo tên; đăng ký lại cùng tên thì thay việc cũ. Trả hàm gỡ việc. */
export function registerJob(name: string, run: Job): () => void {
  jobs.set(name, run)
  return () => {
    if (jobs.get(name) === run) jobs.delete(name)
  }
}

/** Chạy mọi việc mỗi lần kiểm phiên đăng nhập (có thể vài lần mỗi request), nên mỗi việc phải tự đánh dấu mốc đã xử lý. */
export function runDueJobs(): void {
  if (running) return
  running = true
  try {
    for (const [name, run] of jobs) {
      try {
        run()
      } catch (error) {
        // Một việc lỗi không được làm hỏng request hay chặn việc khác; chỉ ghi tên việc, không ghi dữ liệu.
        console.error(`Việc theo giờ ${name} lỗi: ${error instanceof Error ? error.name : 'không rõ'}`)
      }
    }
  } finally {
    running = false
  }
}
