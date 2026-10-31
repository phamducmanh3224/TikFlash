// Shop đồ ăn, đợt 1 (0187) — phần THUẦN (không I/O) của lời dặn + giờ nhận đơn, tách khỏi
// server.js để test đơn vị chạy được mà không dựng HTTP server.

// Lời dặn của khách (0187: "ít cay, không hành"). Tuỳ chọn — CẮT chứ không từ chối: một lời
// dặn dài quá mà làm hỏng cả đơn thì khách mất đơn vì một ô phụ. 300 khớp CHECK của cột.
// Bỏ ký tự điều khiển (trừ xuống dòng): chuỗi này đi thẳng vào tin Telegram của chủ shop và
// vào trang quản trị — escape lo phần HTML, còn ký tự điều khiển thì không ai cần trong một
// lời dặn. Rỗng → null (cột lưu NULL, không lưu '').
export function parseCustomerNote(v) {
  if (v == null) return null;
  const s = String(v).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, ' ')
    .replace(/\n{3,}/g, '\n\n').trim();
  // Cắt theo KÝ TỰ (code point), không theo đơn vị UTF-16: emoji nằm ở mép 300 mà bị cắt đôi
  // thì còn lại nửa cặp surrogate — chuỗi hỏng đi vào DB rồi ra Telegram.
  const cut = [...s].slice(0, 300).join('').trim();
  return cut === '' ? null : cut;
}

// Món của đơn cho payload outbox (0187) — chỉ tên + số lượng: đủ để bếp làm, không mang giá
// vốn/SKU nội bộ ra khỏi DB. Trần 50 dòng để một giỏ bất thường không phình payload.
export function outboxItems(lines) {
  return lines.slice(0, 50).map((l) => ({ title: [...String(l.title)].slice(0, 200).join(''), qty: Number(l.qty) }));
}

// Câu nói với KHÁCH khi cửa hàng không nhận đơn. Trả lời đủ ba câu: chuyện gì (đang nghỉ /
// ngoài giờ), làm gì tiếp (quay lại lúc nào), và không có gì bị mất (giỏ vẫn còn).
export function closedMessage(w) {
  if (w.paused) {
    return `Cửa hàng đang tạm nghỉ, chưa nhận đơn mới.${w.note ? ` ${w.note}` : ''} Giỏ hàng của bạn vẫn được giữ.`;
  }
  return `Cửa hàng nhận đơn từ ${w.openAt} đến ${w.closeAt} mỗi ngày. Hiện đang ngoài giờ nhận đơn — bạn quay lại trong giờ nhé, giỏ hàng vẫn được giữ.`;
}
