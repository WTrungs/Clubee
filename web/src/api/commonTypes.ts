/** Kiểu dùng chung giữa các module trong hợp đồng API. */
export interface PersonRef {
  id: string
  fullName: string
}

/** Tệp đã tải lên (IF-05); `size` tính bằng byte. */
export interface FileRef {
  id: string
  name: string
  size: number
  contentType: string
}
