# Quy ước REST API

Hợp đồng tạm giữa web và backend Spring Boot, dùng cho mock MSW trong lúc chưa có backend.
Hợp đồng chi tiết từng endpoint (tham số, schema, mã lỗi): `docs/openapi.yaml` (OpenAPI 3.1).
Khi backend có spec OpenAPI (springdoc) thì spec là nguồn chuẩn; chỗ nào khác tài liệu này thì sửa mock và client trong `src/api/`.

## Chung

- Gốc: `/api/v1`. Tài nguyên dùng danh từ số nhiều, tên trường camelCase, JSON UTF-8.
- Dữ liệu của CLB nằm dưới `/clubs/{clubId}/...`; máy chủ chỉ trả dữ liệu của CLB đó (BR-SEC-01).
- Ngày giờ: ISO 8601 có offset, ví dụ `2026-11-02T18:30:00+07:00`. Ngày không có giờ: `2026-11-02`.
- Tiền: số nguyên dương, đơn vị VND (BR-FIN-04).
- Enum: `UPPER_SNAKE` tiếng Anh (`IN_PROGRESS`); web tự đổi sang nhãn tiếng Việt.
- Không có `DELETE` cho dữ liệu nghiệp vụ (BR-DATA-01): ẩn, đóng, hủy là chuyển trạng thái.

## Phiên và CSRF

- Đăng nhập tạo phiên cookie của Spring Session (HttpOnly). Web gửi mọi request với `credentials: "include"`.
- CSRF theo `CookieCsrfTokenRepository`: máy chủ đặt cookie `XSRF-TOKEN`, web gửi lại trong header `X-XSRF-TOKEN`
  với mọi request ghi (`POST`, `PUT`, `PATCH`).
- Chưa đăng nhập hoặc hết phiên: `401`.

## Phân trang, tìm kiếm, sắp xếp

- Query: `?page=0&size=20&sort=dueAt,asc&q=từ khóa`; trang bắt đầu từ 0. Lọc nhiều giá trị lặp lại tham số:
  `?status=ASSIGNED&status=IN_PROGRESS`.
- Kết quả:

```json
{ "content": [], "page": 0, "size": 20, "totalElements": 0, "totalPages": 0 }
```

## Lỗi (RFC 9457 Problem Details)

`Content-Type: application/problem+json`

```json
{
  "type": "about:blank",
  "title": "Thông tin đăng ký chưa hợp lệ.",
  "status": 400,
  "detail": "Thông tin đăng ký chưa hợp lệ.",
  "code": "VALIDATION",
  "errors": [{ "field": "email", "message": "Email không hợp lệ." }]
}
```

- `detail` là câu tiếng Việt hiện thẳng cho người dùng. Với `403` phải nêu lý do bị từ chối (IF-01, FR-ORG-04).
- `code` là mã ổn định để web rẽ nhánh; `errors` gắn lỗi vào từng ô của form.

| Mã | Khi nào |
|---|---|
| 400 | Dữ liệu sai định dạng hoặc thiếu |
| 401 | Chưa đăng nhập, hết phiên |
| 403 | Thiếu quyền, sai token CSRF |
| 404 | Không có tài nguyên (hoặc không được biết là có) |
| 409 | Trùng dữ liệu, hoặc `version` lệch do người khác vừa sửa (NFR-REL-03) |
| 422 | Thao tác không hợp lệ với trạng thái hiện tại (chuyển trạng thái ngoài bảng ST-*, vi phạm BR-*) |

## Quyền hiển thị ở web

Mỗi tài nguyên trả `allowedActions: string[]` do máy chủ tính theo chức vụ, phạm vi và bảng phân quyền tại thời điểm đọc.
Web chỉ hiện nút, đích kéo thả có trong danh sách này; web không tự suy quyền. Máy chủ vẫn kiểm tra lại mọi request (SRS 2.4).

## Ghi đồng thời và chuyển trạng thái

- Bản ghi sửa được có trường `version`. Request ghi gửi kèm `version` đang thấy; lệch thì `409`.
- Chuyển trạng thái là tài nguyên con:
  `POST /clubs/{clubId}/tasks/{taskId}/transitions` với `{ "action": "SUBMIT", "reason": "...", "version": 3 }`.
  Trả về bản ghi sau khi chuyển. Chuyển bắt buộc lý do mà thiếu lý do thì `400`.
- Web chỉ báo thành công khi máy chủ đã trả kết quả (NFR-REL-04).

## Endpoint

Danh sách endpoint, body, kết quả và mã lỗi `code` của từng endpoint nằm trong `docs/openapi.yaml`; tài liệu này chỉ giữ
quy ước chung. Test `src/api/mocks/openapiSync.test.ts` (chạy trong `npm run check`) báo lỗi khi route mock MSW và
`paths` của spec lệch nhau, nên thêm hoặc sửa endpoint mock thì sửa spec cùng lúc.

Spec dùng thụt lề 2 dấu cách, mỗi đường dẫn và mỗi method một dòng riêng (`  /clubs/{clubId}:`, `    get:`) để test đọc được.
