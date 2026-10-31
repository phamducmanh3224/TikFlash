# 82 — Shop đồ ăn, đợt 1: lời dặn của khách · tin Telegram có món · giờ nhận đơn

> Ngày 31/10/2026. Migration `0187`. Bộ test mới: `apps/checkout/test/do-an.test.js` (unit),
> `apps/checkout/test/do-an.e2e.mjs` (e2e).

## Vì sao có đợt này

Chủ dự án định hướng nền tảng cho **quán ăn bán online**: mỗi quán có trang riêng làm thêm một
kênh bán, không chịu phí sàn. Câu hỏi đầu tiên là "còn mỗi phần giao diện thôi phải không?".
Đo ra là không hẳn: lõi bán hàng (giỏ, thanh toán, đơn, kho, tiền) đã có, nhưng ba thứ mà
quán ăn gần như đơn nào cũng cần thì **chưa có ở đâu cả**, kể cả trong dữ liệu:

| thiếu gì | hậu quả với quán ăn |
|---|---|
| ô lời dặn khi đặt hàng | "ít cay, không hành, gọi trước khi giao" không có chỗ gõ; khách phải nhắn riêng |
| món trong tin Telegram đơn mới | tin chỉ có số đơn + tổng tiền; bếp phải mở trang quản trị mới biết làm món gì |
| giờ nhận đơn / tạm nghỉ | quán đóng cửa lúc 21h vẫn nhận đơn tới sáng; nghỉ Tết không có nút tắt |

## Đã làm

### 1. `orders.customer_note` — cột RIÊNG, không dùng lại `orders.note`

`note` (0060) là ghi chú NỘI BỘ, nhân viên sửa được ở màn sửa đơn. Gộp lời khách vào đó thì
nhân viên sửa ghi chú là xoá mất đúng câu cần giữ khi có tranh chấp ("tôi đã dặn không hành").

- Trần 300 ký tự ở cả app (cắt theo KÝ TỰ, không theo đơn vị UTF-16 — emoji ở mép không bị
  cắt đôi) và CHECK của cột. Rỗng lưu NULL.
- Hiện ở chi tiết đơn (thẻ "📝 Khách dặn" đứng TRƯỚC danh sách sản phẩm) và phiếu in.
- Là chữ tự do khách gõ ⇒ **coi như dữ liệu cá nhân**: ba đường xoá PII đều xoá nó (sweep ẩn
  danh theo hạn của worker, xoá-theo-yêu-cầu của seller, dọn outbox). `app_expiry` có GRANT
  THEO CỘT nên phải cấp tường minh.
- Đi vào `request_hash` của idempotency **chỉ khi có**, để khoá đang bay lúc nâng cấp không
  bỗng thành "nội dung khác".

### 2. Tin Telegram "đơn mới" có món + lời dặn

Payload outbox `order.created` thêm `items: [{title, qty}]` (tối đa 50, không mang giá/SKU)
và `customer_note`. Worker dựng tin bằng `tg-don-moi.js`: tối đa 15 dòng món rồi "… và N món
khác", luôn dưới 4096 ký tự của Telegram kể cả ca tệ nhất. Payload CŨ (không `items`) ra
**nguyên văn** tin cũ — outbox có thể còn dòng cũ chờ gửi lại.

Đơn tạo tay và đơn bot (cùng đi qua `createOrderCore`) cũng mang `items`.

### 3. Giờ nhận đơn + tạm nghỉ

`shops.orders_paused`, `orders_pause_note`, `order_open_time`, `order_close_time`.

- **Một định nghĩa duy nhất** cho "bây giờ có nhận đơn không": hàm DB
  `shop_order_window_open(open, close, at)`, giờ Việt Nam CỐ ĐỊNH (container chạy UTC). Khung
  `[mở, đóng)`; đóng < mở là qua nửa đêm. Cả hai NULL = cả ngày (shop cũ không đổi gì).
- **Checkout chặn thật** trong transaction đặt hàng (409 `shop_closed`), trước khi khoá giỏ và
  giữ chỗ tồn. Đứng **sau** nhánh replay idempotency: khách bấm lúc 20:59:59, mạng chập, trình
  duyệt gửi lại lúc 21:00:01 thì nhận lại đúng đơn đã tạo.
- **Báo trước ở mọi nơi khách đi qua:** dải báo trên đầu mọi trang cửa hàng; thẻ báo + nút khoá
  ở trang thanh toán. Form không-JS bị từ chối thì dựng lại GIỮ dữ liệu + lời dặn đã gõ.
- **Cài đặt**: nhóm riêng `PATCH /settings/hours` (`shop.write`), có nhật ký. Cố ý KHÔNG nằm
  trong đường ghi-đè-toàn-bộ `PATCH /shops/:id` — form cũ đó không có các ô này. Trang Cài đặt
  nói trạng thái HIỆN TẠI bằng chính hàm checkout dùng để chặn.

### 4. Màu cam cho trang khách thấy (thêm sau, cùng ngày)

Chủ dự án muốn "màu cam gần gũi khách". Em đọc là **những trang KHÁCH MUA nhìn thấy**: mẫu
giao diện *Thực phẩm – Đồ uống* của cửa hàng, trang giỏ hàng / thanh toán / tra cứu đơn
(`checkout`, dùng chung cho mọi shop), và trang tài khoản khách (`account`). Trang quản trị
của người bán, trang đăng ký và trang chủ nền tảng **giữ nguyên** — đó là trang của chủ shop,
không phải của khách.

Phần dễ làm sai: **cam đẹp nhất lại là cam không đọc được.** `#f97316` chỉ đạt 2,8:1 với chữ
trắng, mà nút đặt hàng, thanh topbar, menu dạng band, huy hiệu giỏ đều in chữ TRẮNG lên màu
chính. Nên nút dùng cam đậm (`#c4470b`, 4,94:1) và mọi cặp chữ/nền đều ≥ 4,5:1 — chuẩn chữ
thường của `docs/44`. Ở chế độ tối, CHỮ màu thương hiệu sáng lên (`#fdba74`) nhưng NỀN nút giữ
cam đậm: hai thứ trước đây dùng chung biến `--brand`, nên ở checkout tách ra `--btn1/--btn2`.
Huy hiệu "chờ thanh toán" (`--warn`) đổi sang nâu hổ phách, vì trùng màu nút thì khách không
còn phân biệt được đâu là cảnh báo.

Chốt đo HẬU QUẢ (tỉ lệ tương phản), không ghim mã màu: đổi sang cam khác vẫn xanh, miễn chữ
còn đọc được. Phép đo đi theo ĐÚNG biến mà quy tắc `.btn` dùng, ở cả hai chế độ.

Giới hạn: shop đã tạo trước đó giữ màu cũ đã lưu trong `themes` — muốn cam thì bấm "Áp mẫu"
lại (giữ nguyên banner). Hero của cửa hàng là cam pha tối (động cơ giao diện pha màu chính với
đen để chữ trắng đọc được) nên trông hơi nâu khi shop chưa tải ảnh banner. Mẫu *Mỹ phẩm*
(`#f36b7d`, 2,9:1 với chữ trắng) có cùng lỗi tương phản từ trước — ngoài phạm vi, chưa sửa.

## Giới hạn đã biết — nói thẳng

- **Chỉ chặn đơn khách tự đặt trên website.** Đơn tạo tay và đơn từ bot Messenger không bị
  chặn theo giờ; trang Cài đặt nói rõ điều này. Bot có nên tôn trọng giờ không là câu hỏi
  riêng.
- **Dải báo trên cửa hàng có thể trễ 1–6 phút** sau khi bật/tắt, vì trang cửa hàng được CDN
  cache (`s-maxage=60, stale-while-revalidate=300`). Chặn ở checkout thì tức thì, nên khách
  không đặt lọt — chỉ là có thể chưa thấy dải báo ngay.
- **Chưa có nút tạm nghỉ nhanh ở Tổng quan**; phải vào Cài đặt.
- **Một khung giờ cho mọi ngày.** Chưa có giờ riêng theo thứ, chưa có lịch nghỉ hẹn trước.

## Kiểm chứng

- Unit `do-an.test.js` 9/9; bất biến DB thêm 3 ca (hàm giờ ở biên + 3 múi giờ phiên, CHECK,
  quyền từng vai) → 152.
- E2E `do-an.e2e.mjs` 47/47: đặt giờ TƯƠNG ĐỐI với giờ VN lúc chạy nên xanh ở mọi giờ trong
  ngày. Đo ở bề mặt người dùng: trang thanh toán, dải báo cửa hàng, trang Cài đặt, chi tiết đơn,
  phiếu in, và chính tin Telegram stub nhận được.
- Ma trận đột biến, đối chứng mã sạch **47/0** ở cả đầu lẫn cuối lượt:

| đột biến | e2e |
|---|---|
| bỏ chốt đóng cửa ở checkout | 41/6 |
| chốt đóng cửa đứng TRƯỚC replay idempotency | 46/1 |
| checkout không ghi `customer_note` | 42/5 |
| outbox checkout thiếu `items` | 45/2 |
| dựng lại form làm mất lời dặn | 46/1 |
| nút Đặt hàng vẫn mở khi đóng | 46/1 |
| storefront bỏ dải báo | 45/2 |
| storefront không thoát HTML lời nhắn | 46/1 |
| seller bỏ kiểm "giờ thiếu nửa" (CHECK của DB vẫn chặn ghi) | 46/1 |
| câu báo tạm nghỉ thành "đã lưu" | 46/1 |
| chi tiết đơn không thoát HTML lời dặn | 46/1 |
| seller không đọc `customer_note` | 44/3 |
| đơn tạo tay thiếu `items` | 46/1 |
| BFF bỏ `orders_paused` khỏi nhóm hours | 42/5 |
| storefront tính `accepting_orders` luôn mở | 45/2 |
| worker dựng tin bỏ món + lời dặn (rebuild image) | 46/1 |
| thu GRANT cột giờ của `app_rw` | e2e đỏ 6+ ca · bất biến DB 64/1 |
| thu GRANT `customer_note` của `app_expiry` | bất biến DB 64/1 |
| cấp UPDATE CẤP BẢNG `shops` cho `app_rw` | bất biến DB 63/2 |

  Unit `do-an.test.js`: worker ẩn danh quên lời dặn · dọn outbox không gỡ · dọn outbox không
  nhặt dòng chỉ còn lời dặn · seller xoá-theo-yêu-cầu quên lời dặn · tin bỏ trần 15 món · cắt
  lời dặn hoặc tên món theo đơn vị UTF-16 — đều **8/1**; tin bỏ danh sách món **7/2**.
- Probe 360px (`scripts/probe-360.mjs`), JS bật/tắt: Cài đặt, cửa hàng đang tạm nghỉ, chi tiết
  đơn — 0 tràn ở cả 6 phép đo. Đã mở ảnh ra NHÌN, và nhìn bắt được hai lỗi mà phép đo không
  thấy (mục dưới).
- **Cổng đầy đủ `scripts/ci-local.sh` (31/10): KHÔNG exit 0 — 2 mục đỏ, nói thẳng từng mục.**
  Unit **350** · migration DB trắng **185**, 0 DRIFT, 0 pending · bất biến DB **152** · E2E
  **113/114** · smoke edge/readiness/TLS PASS.
  1. `security-scan`: advisory **high** mới `GHSA-qr28-fpjm-wq7f` của `decode-uri-component`
     (≤0.5.0) ← `query-string` ← `minio` ở checkout/seller/worker. Có sẵn trên `main` — nhánh
     này không đổi tệp `package*.json` nào. Đây là advisory `moderate` mà §9.3b ghi ngày 01/09,
     nay có thêm một lỗ mức high; `decode-uri-component@0.5.1` (23/10) đã vá. Cần một việc
     riêng (npm `overrides` hoặc nâng `minio`), không gộp vào PR này.
  2. `do-an.e2e.mjs` 46/1 — lỗi của tôi: đổi biểu tượng ⏸ → ⏸️ SAU lượt e2e cuối mà không chạy
     lại bộ, nên khẳng định ghim nguyên văn `⏸ Đang tạm nghỉ` đỏ. Nay khẳng định đọc câu chữ
     thay vì biểu tượng; chạy lại riêng bộ đó: **47/47**. Đúng luật §5 "chỉ test → chạy đúng bộ
     đó"; cổng đầy đủ chưa chạy lại.

**Màu cam (mục 4):** 3 ca unit mới trong `do-an.test.js` (unit toàn bộ **353/353**). Ma trận
**9/9 đột biến đỏ** (11/1 mỗi ca): cam sáng cho primary · accent sáng · chữ phụ nhạt (mẫu) ·
nút checkout cam sáng · `.btn` quay lại dùng `--brand` (sáng lên ở chế độ tối) · chế độ tối đè
nền nút · chữ phụ checkout nhạt · huy hiệu chờ nhạt · nút tài khoản cam sáng; đối chứng 12/0.
Hồi quy e2e sau khi đổi: do-an 47 · checkout 29 · buyer-flow 35 · account 71 · admin-preset 10
· storefront 165 · verify-provision 15 · address-picker 14 — tất cả 0 fail. Ảnh 390px sáng +
tối: không tràn ngang, đã mở ra xem.

## Lỗi của chính lượt này

- **Nhìn ảnh bắt được hai lỗi mà 47 khẳng định không thấy.** Nút "Cửa hàng chưa nhận đơn lúc
  này" có `disabled` đúng (e2e kiểm thuộc tính đó) nhưng vẫn mang nền gradient xanh như nút
  bấm được — khách bấm mãi không thấy gì. Và biểu tượng ⏸ thiếu bộ chọn biến thể U+FE0F nên
  hiện thành hai vạch mảnh "ıı". Cả hai đều xanh trong mọi phép đo; chỉ lộ khi mở ảnh.
- **Ma trận đột biến lượt đầu bị nhiễm chéo.** Harness khôi phục tệp sau mỗi đột biến nhưng
  KHÔNG restart service — đúng bẫy §4 "sửa src mà quên restart". Tiến trình vẫn chạy mã đột
  biến của lượt trước, nên từ M7 trở đi mỗi dòng đỏ thêm vài ca của đột biến cũ (M10 ra 43/4
  thay vì 46/1). Đỏ vẫn là đỏ, nhưng con số không còn nói đột biến NÀO bắt được ở đâu. Sửa
  harness (restart sau khi khôi phục + chạy đối chứng mã sạch ở đầu và cuối) rồi chạy lại toàn
  bộ. Dấu hiệu nhận ra: cùng một ca lạ ("nút Đặt hàng bị khoá") đỏ ở nhiều đột biến không đụng
  tới nó.
- **Đột biến DB tự làm hỏng DB dev.** Để thử "cấp UPDATE cấp bảng" tôi GRANT rồi
  `REVOKE UPDATE ON shops FROM app_rw` để hoàn nguyên — nhưng REVOKE quyền CẤP BẢNG trong
  Postgres **thu luôn mọi quyền CẤP CỘT** cùng loại. 25 cột 0165 cấp cho `app_rw` biến mất,
  bất biến DB đối chứng cuối ra 64/1 ("vai trò database"). Khôi phục bằng đúng hợp các
  `GRANT UPDATE (…) ON shops TO app_rw` từ migration ≥0165 rồi đối chiếu
  `information_schema.column_privileges`: đủ 29 cột, 152/152. Đây là mặt kia của luật §3
  "GRANT cấp bảng vô hiệu hoá tính toán cấp cột": REVOKE cấp bảng cũng xoá tính toán đó.

- Test unit cũ `shared-sql.test.js` dùng regex `[\s\S]*?` để rút danh sách cột của
  `GRANT UPDATE (…) ON shops TO app_rw`; với migration mới có thêm một `GRANT … ON orders TO
  app_expiry` phía trên, regex băng qua dòng đó và rút nhầm. Đổi sang `[^()]*`.
- So `JSON.stringify` hai mảng món trong e2e: jsonb **không giữ thứ tự khoá** nên
  `{"qty":2,"title":…}` ≠ `{"title":…,"qty":2}` — đỏ giả ở lượt chạy đầu. Nay so theo nội dung.
