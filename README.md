# Clubee
This is an academic project.

## Chạy khi develop

Cần Node.js 24 trở lên và `make`. Docker chỉ cần khi chạy `make up`.

Cài `make`:

- Windows: `scoop install make` hoặc `winget install ezwinports.make`, rồi mở lại terminal
- macOS: `xcode-select --install`
- Linux (Debian/Ubuntu): `sudo apt install make`

Chạy ở gốc repo:

| Lệnh | Việc |
|---|---|
| `make` | Xem danh sách lệnh |
| `make install` | Cài thư viện cho web |
| `make dev` | Chạy web bằng Vite ở http://localhost:5173, API do mock MSW trả lời. Tự cài thư viện nếu chưa có |
| `make check` | Lint, kiểm tra kiểu, unit test, build |
| `make test` | Chạy unit test |
| `make e2e` | Chạy test Playwright (cần `npx playwright install chromium` trong `web/`) |
| `make up` | Build và chạy web bằng Docker ở http://localhost:3000 |
| `make down` | Dừng và xóa container Docker |
| `make logs` | Xem log của web trong Docker |
| `make ps` | Xem trạng thái container Docker |

Không có `make` thì chạy lệnh npm trong `web/` (xem [web/README.md](web/README.md)).
