# 84 — Giá theo số lượng ("mua càng nhiều càng rẻ"), migration `0188`

Chủ dự án (17/11/2026) cần cho mùa Tết: shop sỉ quần áo bán lẻ online với giá **tiệm cận giá sỉ
khi khách mua nhiều**. MePOS (kho App-Sales) đã có "Giá khi mua nhiều"; TikFlash chưa có gì
tương tự — chỉ có mã giảm giá (giảm trên tổng đơn) và flash sale (giảm theo thời gian).

## Luật — đã chốt

| câu hỏi | chọn | vì sao |
|---|---|---|
| bậc đặt ở đâu | từng sản phẩm, tối đa 5 bậc | giống MePOS, người bán dùng một bảng giá cho cả tiệm lẫn web |
| bậc là gì | "mua từ N cái, giá mỗi cái X" (tiền, không %) | người bán đã có bảng giá sỉ bằng tiền; quy ra % là mời làm tròn sai |
| đếm số lượng thế nào | **gộp mọi size/màu của một sản phẩm** | chủ dự án chọn: 1 M + 1 L + 1 XL cùng mẫu là 3 cái |
| bậc áp cho phần nào | cả số lượng theo bậc cao nhất đã đạt | đúng luật MePOS (`qtyBreakPrices.ts`) |
| biến thể vốn rẻ hơn bậc | giữ giá biến thể | bậc không bao giờ làm một dòng đắt lên |
| gặp flash sale | lấy giá thấp hơn, **không cộng dồn** | cộng dồn sinh giá dưới vốn mà không ai chủ ý đặt |
| gặp mã giảm giá | mã vẫn áp trên tổng đã giảm (như với flash sale) | giữ nguyên hành vi hiện có của coupon |
| shop dùng POS ngoài làm chủ giá | gác bằng `external_master_allows_online_promotions()` | cùng hàng rào với flash sale (0178) |

Luật kiểm khi lưu lấy theo `qtyBreakPricesIssue` của MePOS: "mua từ" ≥ 2 và tăng dần, giá > 0 và
giảm dần, giá bậc thấp hơn giá bán (ở đây: giá CAO NHẤT các biến thể). Lỗi nêu đúng "mức N" theo
thứ tự người bán gõ. Dòng trống cả hai ô bị bỏ qua.

## Đường đi

- **DB** `0188`: bảng `product_qty_breaks` (FORCE RLS, `app_rw` CRUD, `app_store`/`app_checkout`
  chỉ đọc) và hàm `qty_break_price(product, qty)` — nguồn duy nhất chọn bậc.
- **seller** `PUT /shops/:id/products/:id/qty-breaks` (`catalog.write`), `GET` sản phẩm trả
  `qty_breaks`. Thay trọn bộ trong một transaction.
- **checkout** `qtyBreaksFor` + `lineUnit` dùng chung cho `summarize` và `createOrderTx`. Đếm trên
  chính danh sách dòng đã loại biến thể mồ côi, nên giỏ và đơn không bao giờ đếm hai tập khác nhau.
  Snapshot: `orig_unit_price_vnd` = giá gốc khi có giảm, `promotion_id` chỉ khi flash sale thắng.
  Cổng `subtotal_seen` sẵn có bắt được việc shop đổi bậc giữa lúc khách điền form.
- **giỏ** gắn nhãn "giá mua nhiều" và nhắc "mua thêm N cái cùng mẫu…" — một lần cho mỗi mẫu,
  và chỉ khi bậc kế tiếp rẻ hơn giá đang trả.
- **trang sản phẩm** in bảng bậc, chỉ những bậc rẻ hơn giá đang hiện (flash sale rẻ hơn thì
  không hứa bậc không bao giờ áp), kèm câu "cộng chung mọi size, màu" khi có nhiều biến thể.
- **quản trị** thẻ "Giá khi mua nhiều" trong trang sửa sản phẩm, năm cặp ô.

## Kiểm chứng

`apps/checkout/test/qty-breaks.e2e.mjs` **24/24**, khẳng định trên cột tiền thật của đơn và trên
HTML khách thấy. Ma trận **5/5 đột biến đỏ**: giỏ bỏ bậc (3 đỏ) · chốt đơn bỏ bậc (3 đỏ) · đếm
theo từng size thay vì gộp (3 đỏ) · bậc đè cả giá vốn rẻ hơn (2 đỏ) · trang sản phẩm hứa bậc đắt
hơn giá sale (1 đỏ); hoàn nguyên 24/0.

## Chưa làm, đã biết

- **Đơn tay và đơn qua bot Messenger / khoá kết nối chưa áp bậc** — hai đường đó đọc
  `promo_effective` riêng (`seller/orders.js`, `ingest-catalog.js`). Bot báo giá theo giá thường.
- Thẻ sản phẩm ở lưới chưa có nhãn "mua nhiều rẻ hơn".
- Báo cáo chưa tách doanh thu "nhờ bậc số lượng" khỏi doanh thu thường.
- Thẻ quản trị chưa giữ lại số đã gõ khi lưu lỗi (giống thẻ thông số hiện có).
