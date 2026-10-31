-- 0187 — Shop đồ ăn, đợt 1: GHI CHÚ của khách trên đơn + GIỜ NHẬN ĐƠN / TẠM NGHỈ của cửa hàng.
--
-- ── 1. orders.customer_note ─────────────────────────────────────────────────────────────
-- Câu khách gõ lúc đặt ("ít cay, không hành", "gọi trước khi tới"). Với quán ăn đây là thứ
-- gần như đơn nào cũng có, mà trang thanh toán trước 0187 không có ô nào để gõ.
--
-- Vì sao CỘT RIÊNG chứ không dùng lại `orders.note` (0060): `note` là ghi chú NỘI BỘ của
-- nhân viên, sửa được ở màn sửa đơn (orders.js: `note = P.hasNote ? … : o.note`). Gộp hai thứ
-- vào một cột thì nhân viên sửa ghi chú nội bộ là XOÁ MẤT lời khách dặn — đúng thứ cần giữ
-- nguyên văn khi có tranh chấp ("tôi đã dặn không hành"). Hai câu hỏi khác nhau, hai cột.
--
-- Trần 300 ký tự: đủ cho một lời dặn, không đủ để biến ô này thành kênh nhồi dữ liệu. Ép ở
-- tầng app (cắt) VÀ ở đây (CHECK) — app là lớp tiện, CHECK là lớp không lọt.
-- Rỗng lưu NULL, không lưu '' (NULL ≠ "khách gõ chuỗi rỗng"; length ≥ 1 chặn nhánh lệch).
ALTER TABLE orders ADD COLUMN customer_note text
  CHECK (customer_note IS NULL OR length(customer_note) BETWEEN 1 AND 300);

-- Quyền:
--   app_checkout — INSERT + SELECT CẤP BẢNG trên orders (0012) → tự phủ cột mới.
--   app_rw       — CRUD cấp bảng (0003) → seller đọc được + đường xoá-theo-yêu-cầu ghi NULL được.
--   app_customer — SELECT cấp bảng (0083) → khách thấy lại lời dặn CỦA CHÍNH MÌNH; RLS 2 trục giữ nguyên.
--   app_expiry   — GRANT THEO CỘT (0064). Lời dặn là chữ tự do do khách gõ nên hay chứa đúng
--                  thứ luật BVDLCN coi là dữ liệu cá nhân (tên người nhận, số nhà, SĐT người
--                  thân). Sweep ẩn danh theo hạn lưu trữ PHẢI xoá được nó; quên dòng dưới thì
--                  UPDATE của sweep 42501, lỗi bị nuốt thành log và đơn đứng nguyên chưa ẩn danh.
GRANT UPDATE (customer_note) ON orders TO app_expiry;

-- ── 2. shops: giờ nhận đơn + tạm nghỉ ────────────────────────────────────────────────────
-- orders_paused     — công tắc "Tạm nghỉ" (nghỉ Tết, hết nguyên liệu, quán bận). Bật là khách
--                     KHÔNG đặt được đơn mới trên website, bất kể giờ.
-- orders_pause_note — câu shop muốn khách đọc khi tạm nghỉ ("Nghỉ Tết tới mùng 6"). Tuỳ chọn.
-- order_open_time / order_close_time — khung giờ nhận đơn MỖI NGÀY, theo giờ Việt Nam.
--                     Cả hai NULL = nhận đơn cả ngày (hành vi trước 0187 — shop cũ không đổi gì).
--                     close < open nghĩa là khung QUA NỬA ĐÊM (18:00 → 02:00).
ALTER TABLE shops
  ADD COLUMN orders_paused boolean NOT NULL DEFAULT false,
  ADD COLUMN orders_pause_note text
    CHECK (orders_pause_note IS NULL OR length(orders_pause_note) BETWEEN 1 AND 200),
  ADD COLUMN order_open_time time,
  ADD COLUMN order_close_time time,
  -- Một nửa khung giờ là trạng thái vô nghĩa (mở lúc 10h, đóng… không bao giờ?). Bằng nhau
  -- cũng vô nghĩa: khung rỗng hay cả ngày? Bắt shop nói rõ — muốn cả ngày thì để trống cả hai.
  ADD CONSTRAINT shops_order_hours_pair CHECK (
    (order_open_time IS NULL AND order_close_time IS NULL)
    OR (order_open_time IS NOT NULL AND order_close_time IS NOT NULL
        AND order_open_time <> order_close_time));

-- app_rw bị thu UPDATE cấp bảng trên shops từ 0165 (chỉ còn danh sách cột). Cột mới KHÔNG tự
-- vào — đúng chủ ý của 0165 — nên liệt kê tường minh. Không có dòng này thì lưu cài đặt giờ
-- nhận đơn trả 42501 → 500.
GRANT UPDATE (orders_paused, orders_pause_note, order_open_time, order_close_time) ON shops TO app_rw;
-- app_checkout (0012) và app_store (0011) có SELECT CẤP BẢNG trên shops → tự đọc được.

-- ── 3. Một định nghĩa DUY NHẤT cho "bây giờ có trong giờ nhận đơn không" ──────────────────
-- Checkout (chốt đơn) và storefront (dải thông báo) cùng hỏi câu này. Viết hai lần bằng JS là
-- hai bản sẽ trôi khỏi nhau — đúng lớp lỗi §3 cấm — và cả hai service đều đã nói chuyện với
-- Postgres, nên định nghĩa nằm ở đây.
--
-- GIỜ VIỆT NAM CỐ ĐỊNH, không đọc múi giờ phiên: container chạy UTC, quên đổi múi giờ là quán
-- mở 10:00 nhận đơn từ 17:00 — lệch 7 tiếng mà không test nào thấy nếu test cũng chạy UTC.
-- Khung [open, close): đúng giờ mở là ĐANG mở, đúng giờ đóng là ĐÃ đóng.
-- STABLE (không IMMUTABLE): đổi múi giờ phụ thuộc bảng tzdata của máy chủ.
CREATE FUNCTION shop_order_window_open(p_open time, p_close time, p_at timestamptz)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT CASE
    WHEN p_open IS NULL OR p_close IS NULL THEN true
    WHEN p_open < p_close THEN
      (p_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::time >= p_open
      AND (p_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::time < p_close
    ELSE
      (p_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::time >= p_open
      OR (p_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::time < p_close
  END
$$;
