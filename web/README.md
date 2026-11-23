# Clubee, web

Frontend web của Clubee, hệ thống quản lý CLB, đội, nhóm (SE100, Nhóm 18). Đặc tả: SRS và báo cáo tiến độ ở `../docs/`.

## Chạy thử

Cần Node.js 24 trở lên.

```bash
npm install
npm run dev
```

Mở http://localhost:5173. Ở chế độ dev, mọi API được trả lời bằng mock MSW chạy trong trình duyệt, chưa cần backend.
Trang đăng nhập có danh sách tài khoản demo theo vai trò (Chủ nhiệm, Trưởng BTC, Thành viên). Mock nhận mọi mật khẩu từ 8 ký tự.
Dữ liệu mock là dữ liệu tổng hợp và nằm trong bộ nhớ, tải lại trang thì về lại dữ liệu ban đầu.

Tắt mock để gọi backend thật (Vite chuyển `/api` sang `http://localhost:8080`): tạo `.env.local` theo `.env.example` với `VITE_USE_MOCK=false`.

## Lệnh

| Lệnh | Việc |
|---|---|
| `npm run dev` | Chạy dev server |
| `npm run check` | Lint, kiểm tra kiểu, unit test, build |
| `npm run test` | Unit test (Vitest; mạng do MSW trả lời, không gọi mạng thật) |
| `npm run e2e` | Mở các trang ở 360 px và 1440 px, kiểm tra không cuộn ngang, chụp màn hình vào `test-results/screens/` |

`npm run e2e` cần Chromium của Playwright: `npx playwright install chromium`.

## Chạy bằng Docker

Ở gốc repo:

```bash
docker compose up --build
```

Mở http://localhost:3000 (đổi cổng bằng biến `WEB_PORT`). Image mặc định build với mock MSW bật.
Để gọi backend thật qua nginx (`/api` chuyển sang service `server:8080`), build lại với `VITE_USE_MOCK=false docker compose up --build`. `VITE_USE_MOCK` được nhúng lúc build nên đổi giá trị thì phải build lại image.

## Cấu trúc

```
src/
  app/        router, provider, layout (xác thực, ứng dụng, CLB)
  api/        httpClient (lớp duy nhất gọi mạng), lỗi, phân trang, mock MSW
  shared/     component giao diện, định dạng ngày/tiền, hiệu ứng, theme
  features/   mỗi tính năng theo MVVM: model/ (kiểu + repository), viewModel/ (hook), view/ (component)
docs/         quy ước API, hợp đồng OpenAPI
```

Quy ước REST giữa web và backend: `docs/apiConventions.md`. Hợp đồng API: `docs/openapi.yaml` (test so route mock với spec).
