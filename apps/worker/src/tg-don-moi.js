// Tin Telegram "đơn mới" cho chủ shop — tách khỏi index.js để test đơn vị import được mà
// không khởi động worker (index.js mở kết nối DB/Redis ngay khi nạp).

// Tin "đơn mới" (0187): kèm DANH SÁCH MÓN + LỜI DẶN. Trước đây tin chỉ có số đơn + tổng tiền,
// nên bếp của quán ăn phải mở trang quản trị mới biết làm món gì — đúng lúc tay đang bận.
// Payload cũ (outbox ghi trước 0187, hoặc đường tạo đơn chưa gửi `items`) vẫn ra đúng tin
// cũ: thiếu `items` thì không có khối món, không đoán.
// Trần 15 dòng: Telegram cắt tin ở 4096 ký tự, mà một tin dài tới mức phải cuộn thì bếp cũng
// không đọc hết — dòng cuối nói còn bao nhiêu món để người ta biết mà mở trang đơn.
const TG_MON_TOI_DA = 15;
export function tgDonMoi(p, money) {
  let t = `🛒 Đơn MỚI #${p.order_number} — ${money(p.total_vnd)} (${p.payment_method === 'qr' ? 'chờ CK QR' : 'COD'})${p.customer_name ? `\nKhách: ${p.customer_name}` : ''}`;
  const items = Array.isArray(p.items) ? p.items.filter((it) => it && typeof it.title === 'string') : [];
  if (items.length) {
    const shown = items.slice(0, TG_MON_TOI_DA).map((it) => `• ${Number(it.qty) || 0} × ${it.title}`);
    const more = items.length - shown.length;
    t += `\n${shown.join('\n')}${more > 0 ? `\n… và ${more} món khác (mở trang đơn để xem đủ)` : ''}`;
  }
  if (typeof p.customer_note === 'string' && p.customer_note.trim()) t += `\n📝 Khách dặn: ${p.customer_note.trim()}`;
  return t;
}
