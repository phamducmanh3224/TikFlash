-- 0188 — GIÁ THEO SỐ LƯỢNG ("mua càng nhiều càng rẻ") cho từng sản phẩm.
--
-- Chủ dự án (17/11) chọn: bậc đặt theo TỪNG SẢN PHẨM, giống "Giá khi mua nhiều" của MePOS —
-- mỗi dòng "mua từ N cái, giá mỗi cái X". Số lượng ĐẾM GỘP mọi biến thể (size/màu) của cùng
-- một sản phẩm trong giỏ: khách sỉ quần áo lấy 1 M + 1 L + 1 XL cùng mẫu thì đó là 3 cái.
-- Cả số lượng của sản phẩm tính theo giá của bậc CAO NHẤT đã đạt (không chia bậc lũy tiến),
-- đúng luật MePOS (`server/src/lib/qtyBreakPrices.ts`), để cùng một bảng giá ở tiệm và trên
-- web cho cùng một con số.
--
-- ── Vì sao GIÁ TUYỆT ĐỐI chứ không phần trăm ────────────────────────────────────────────
-- Người bán đã có sẵn bảng giá sỉ bằng tiền ("lấy 10 cái thì 85k/cái"), không phải bằng %.
-- Bắt họ quy đổi ra % là mời làm tròn sai. Biến thể có giá KHÁC nhau (size lớn đắt hơn) thì
-- mỗi dòng lấy giá THẤP HƠN giữa giá biến thể và giá bậc — bậc không bao giờ làm một dòng
-- ĐẮT lên. Ghép với flash sale (0082) cũng vậy: lấy giá thấp nhất, KHÔNG cộng dồn hai khoản
-- giảm (cộng dồn sinh ra giá dưới vốn mà không ai chủ ý đặt).
--
-- ── Vì sao một HÀM SQL là nguồn chọn bậc ─────────────────────────────────────────────────
-- Cùng lý do với promo_effective (0082): trang sản phẩm, giỏ, trang thanh toán và lúc chốt
-- đơn phải đọc ĐÚNG một luật. Hai bản chép tay sẽ trôi, và trôi ở đường tiền nghĩa là nút
-- "Đặt hàng · X" in một số còn đơn thu một số khác (cổng subtotal_seen sẽ 409 mãi).
-- Phần ĐẾM số lượng gộp theo sản phẩm nằm ở checkout (JS), trên CHÍNH danh sách dòng đã lọc
-- biến thể mồ côi — đếm ở SQL riêng thì lại thành hai tập dòng khác nhau (bài học 0082/summarize).

CREATE TABLE product_qty_breaks (
  shop_id    uuid   NOT NULL,
  product_id uuid   NOT NULL,
  -- Từ 2: "mua từ 1 cái" là giá bán thường, không phải bậc. Trần 100.000 chặn số gõ nhầm.
  min_qty    int    NOT NULL CHECK (min_qty BETWEEN 2 AND 100000),
  price_vnd  bigint NOT NULL CHECK (price_vnd > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (shop_id, product_id, min_qty),
  FOREIGN KEY (shop_id) REFERENCES shops (id),
  -- Xoá sản phẩm thì bậc đi theo; không có bậc mồ côi trỏ vào sản phẩm đã mất.
  FOREIGN KEY (shop_id, product_id) REFERENCES products (shop_id, id) ON DELETE CASCADE
);
ALTER TABLE product_qty_breaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_qty_breaks FORCE  ROW LEVEL SECURITY;

-- ── HÀM CHỌN BẬC — NGUỒN DUY NHẤT ───────────────────────────────────────────────────────
-- Giá MỘT cái ở bậc cao nhất mà p_qty đã đạt; NULL khi chưa đạt bậc nào (NULL ≠ 0: không có
-- bậc khác hẳn bậc giá 0, và CHECK ở trên đã cấm giá 0).
-- SECURITY INVOKER + STABLE như promo_effective: RLS áp theo vai gọi, nên vai không có quyền
-- đọc bảng thì nhận lỗi quyền chứ không nhận bậc của shop khác.
-- Gác bằng external_master_allows_online_promotions() (0178): shop dùng POS ngoài làm chủ giá
-- mà provider chưa xác minh giữ giá từng dòng thì KHÔNG giảm online — cùng hàng rào với flash sale.
CREATE FUNCTION qty_break_price(p_product_id uuid, p_qty bigint)
RETURNS bigint
LANGUAGE sql STABLE AS $func$
  SELECT qb.price_vnd
    FROM product_qty_breaks qb
   WHERE external_master_allows_online_promotions()
     AND qb.shop_id = current_shop_id()
     AND qb.product_id = p_product_id
     AND qb.min_qty <= p_qty
   ORDER BY qb.min_qty DESC
   LIMIT 1;
$func$;

-- ── GRANTS + RLS ────────────────────────────────────────────────────────────────────────
-- app_rw (seller): đặt / sửa bậc. Default privileges 0003 vốn đã cấp CRUD; viết tường minh
-- để schema-invariants đọc được ý định.
GRANT SELECT, INSERT, UPDATE, DELETE ON product_qty_breaks TO app_rw;
CREATE POLICY tenant_isolation ON product_qty_breaks FOR ALL TO app_rw
  USING (shop_id = current_shop_id()) WITH CHECK (shop_id = current_shop_id());

-- app_store (storefront): CHỈ ĐỌC để in bảng bậc trên trang sản phẩm.
GRANT SELECT ON product_qty_breaks TO app_store;
CREATE POLICY store_qty_breaks ON product_qty_breaks FOR SELECT TO app_store
  USING (shop_id = current_shop_id());

-- app_checkout: CHỈ ĐỌC để tính giá trong giỏ và lúc chốt đơn. Seller sửa bậc giữa lúc khách
-- đang ở trang thanh toán thì subtotal tính lại khác subtotal_seen → 409, dựng lại form giá mới.
GRANT SELECT ON product_qty_breaks TO app_checkout;
CREATE POLICY checkout_qty_breaks ON product_qty_breaks FOR SELECT TO app_checkout
  USING (shop_id = current_shop_id());

REVOKE EXECUTE ON FUNCTION qty_break_price(uuid, bigint) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION qty_break_price(uuid, bigint) TO app_rw, app_store, app_checkout;
