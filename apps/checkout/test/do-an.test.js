// UNIT — Shop đồ ăn, đợt 1 (0187): lời dặn của khách, tin Telegram kèm món, giờ nhận đơn.
//
// Vì sao có bộ unit bên cạnh e2e: ba thứ ở đây e2e không dựng nổi đủ ca biên —
//   · lời dặn có emoji nằm đúng mép 300 ký tự (cắt theo đơn vị UTF-16 là ra nửa cặp surrogate);
//   · đơn 20 món (tin Telegram phải cắt ở 15 và nói còn bao nhiêu);
//   · và CHỖ VIẾT của luật ẩn danh: worker chỉ quét đơn cũ hơn N tháng nên e2e không chờ được
//     tới lúc sweep chạy, còn bất biến mức mã nguồn thì thấy ngay câu UPDATE thiếu cột.
//
// Chạy: node --test apps/checkout/test/do-an.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCustomerNote, outboxItems, closedMessage } from '../src/do-an.js';
import { tgDonMoi } from '../../worker/src/tg-don-moi.js';
import { PRESETS } from '../../../packages/presets/src/index.js';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const doc = (p) => readFileSync(join(ROOT, p), 'utf8');
const money = (v) => new Intl.NumberFormat('vi-VN').format(Number(v)) + 'đ';

test('lời dặn: rỗng/khoảng trắng → null, giữ xuống dòng, bỏ ký tự điều khiển', () => {
  assert.equal(parseCustomerNote(undefined), null);
  assert.equal(parseCustomerNote(null), null);
  assert.equal(parseCustomerNote(''), null);
  assert.equal(parseCustomerNote('   \n\t  '), null, 'chỉ khoảng trắng phải thành NULL, không lưu chuỗi rỗng');
  assert.equal(parseCustomerNote('  ít cay  '), 'ít cay');
  assert.equal(parseCustomerNote('ít cay\r\nkhông hành'), 'ít cay\nkhông hành', 'CRLF của form chuẩn hoá về LF, KHÔNG gộp thành một dòng');
  assert.equal(parseCustomerNote('a\u0000b\u0007c'), 'a b c', 'ký tự điều khiển thành khoảng trắng');
  assert.equal(parseCustomerNote('a\n\n\n\n\nb'), 'a\n\nb', 'không cho nhồi hàng chục dòng trống');
});

test('lời dặn: cắt ở 300 KÝ TỰ — khớp CHECK của cột, không làm vỡ emoji ở mép', () => {
  const dai = 'á'.repeat(400);
  assert.equal([...parseCustomerNote(dai)].length, 300);
  // Emoji 🌶 là MỘT ký tự nhưng HAI đơn vị UTF-16. 299 chữ + emoji = 300 ký tự = vừa khít.
  const mep = 'a'.repeat(299) + '🌶' + 'thừa';
  const out = parseCustomerNote(mep);
  assert.equal([...out].length, 300);
  assert.ok(out.endsWith('🌶'), 'emoji ở mép phải còn nguyên, không bị cắt đôi');
  assert.doesNotMatch(out, /[\uD800-\uDBFF](?![\uDC00-\uDFFF])/, 'không được để lại nửa cặp surrogate');
});

test('món cho outbox: chỉ tên + số lượng, không mang giá/SKU/variant ra khỏi DB', () => {
  const items = outboxItems([{ variant_id: 'v1', title: 'Cơm gà - Lớn', sku: 'CG-L', unit: 45000, qty: 2, orig: null }]);
  assert.deepEqual(items, [{ title: 'Cơm gà - Lớn', qty: 2 }]);
  assert.equal(outboxItems(Array.from({ length: 80 }, (_, i) => ({ title: `M${i}`, qty: 1 }))).length, 50);
  // Tên món cắt ở 200 KÝ TỰ, cùng lý do với lời dặn: emoji ở mép không được thành nửa cặp surrogate.
  const ten = outboxItems([{ title: 'a'.repeat(199) + '🍜' + 'thừa', qty: 1 }])[0].title;
  assert.equal([...ten].length, 200);
  assert.ok(ten.endsWith('🍜'), 'emoji ở mép tên món phải còn nguyên');
});

test('Telegram đơn mới: có món + lời dặn; payload CŨ (không items) ra đúng tin cũ', () => {
  const cu = { order_number: 7, total_vnd: 90000, payment_method: 'cod', customer_name: 'Khách A' };
  assert.equal(tgDonMoi(cu, money), '🛒 Đơn MỚI #7 — 90.000đ (COD)\nKhách: Khách A',
    'payload trước 0187 phải ra NGUYÊN VĂN tin cũ — outbox còn dòng cũ đang chờ gửi lại');

  const moi = { ...cu, items: [{ title: 'Cơm gà - Lớn', qty: 2 }, { title: 'Trà đá', qty: 1 }], customer_note: 'ít cay\nkhông hành' };
  const t = tgDonMoi(moi, money);
  assert.match(t, /• 2 × Cơm gà - Lớn/);
  assert.match(t, /• 1 × Trà đá/);
  assert.match(t, /📝 Khách dặn: ít cay\nkhông hành$/);
});

test('Telegram đơn mới: đơn nhiều món cắt ở 15 và NÓI còn bao nhiêu', () => {
  const items = Array.from({ length: 20 }, (_, i) => ({ title: `Món ${i + 1}`, qty: 1 }));
  const t = tgDonMoi({ order_number: 1, total_vnd: 1, payment_method: 'qr', items }, money);
  assert.equal((t.match(/^• /gm) ?? []).length, 15);
  assert.match(t, /… và 5 món khác/);
  assert.ok(t.length < 4096, 'tin phải nằm trong giới hạn 4096 ký tự của Telegram');
  // Trường hợp tệ nhất cho phép: 15 tên dài 200 + lời dặn 300.
  const toiDa = tgDonMoi({ order_number: 1, total_vnd: 1, payment_method: 'cod', customer_name: 'x'.repeat(120),
    items: Array.from({ length: 50 }, () => ({ title: 'm'.repeat(200), qty: 99 })), customer_note: 'n'.repeat(300) }, money);
  assert.ok(toiDa.length < 4096, `tin tệ nhất dài ${toiDa.length} — vượt 4096 thì Telegram từ chối cả tin`);
});

test('câu báo đóng cửa: nói lý do + khi nào quay lại + giỏ còn giữ', () => {
  const ngoaiGio = closedMessage({ paused: false, openAt: '10:00', closeAt: '21:00' });
  assert.match(ngoaiGio, /10:00/);
  assert.match(ngoaiGio, /21:00/);
  assert.match(ngoaiGio, /giỏ hàng vẫn được giữ/i);
  const nghi = closedMessage({ paused: true, note: 'Nghỉ Tết tới mùng 6.' });
  assert.match(nghi, /tạm nghỉ/);
  assert.match(nghi, /Nghỉ Tết tới mùng 6\./);
  assert.doesNotMatch(nghi, /\d\d:\d\d/, 'đang tạm nghỉ thì không được hứa giờ mở cửa');
});

// ── Chỗ viết của luật ẩn danh ─────────────────────────────────────────────────────────────
// Lời dặn là chữ khách tự gõ → coi như dữ liệu cá nhân. Ba đường xoá PII phải nhắc tới nó.
// Đây là chốt CHÍNH TẢ ở mức mã nguồn (đếm chỗ viết); quyền DB để các câu đó chạy được nằm ở
// packages/db/test/schema-invariants.test.js.
test('ẩn danh theo hạn lưu trữ (worker) xoá customer_note', () => {
  const src = doc('apps/worker/src/index.js');
  const m = /UPDATE orders o\s+SET customer_name = '\(đã ẩn danh\)'([\s\S]*?)FROM doomed d/.exec(src);
  assert.ok(m, 'không thấy câu UPDATE ẩn danh của worker — đổi hình thì sửa regex, đừng xoá test');
  assert.match(m[1], /customer_note = NULL/);
});

test('xoá theo yêu cầu của shop (seller) xoá customer_note', () => {
  const src = doc('apps/seller/src/customers.js');
  const m = /UPDATE orders SET customer_name = '\(đã ẩn danh\)'([\s\S]*?)WHERE customer_phone = \$1/.exec(src);
  assert.ok(m, 'không thấy câu UPDATE ẩn danh của seller');
  assert.match(m[1], /customer_note = NULL/);
});

test('dọn outbox gỡ customer_note cùng các khoá PII khác', () => {
  const src = doc('apps/worker/src/index.js');
  const m = /UPDATE outbox SET payload = payload([^\n]*)\n/.exec(src);
  assert.ok(m, 'không thấy câu dọn outbox');
  assert.match(m[1], /- 'customer_note'/);
  assert.match(src, /jsonb_exists\(payload, 'customer_note'\)/,
    'điều kiện WHERE cũng phải nhặt dòng CHỈ còn customer_note — không thì dòng đó không bao giờ được dọn');
});

// ── Màu cam cho trang khách (31/10/2026) ──────────────────────────────────────────────────
// Chủ dự án chọn cam "gần gũi". Cam sáng đẹp nhất lại là cam KHÔNG ĐỌC ĐƯỢC: #f97316 chỉ đạt
// 2,8:1 với chữ trắng, trong khi nút đặt hàng, thanh topbar, menu dạng band và huy hiệu giỏ
// đều in chữ TRẮNG lên màu chính. Chốt đo HẬU QUẢ (tỉ lệ tương phản WCAG) chứ không ghim mã
// màu: đổi sang cam khác vẫn xanh, miễn chữ còn đọc được. Ngưỡng 4,5:1 = chữ thường (docs/44).

const kenh = (h) => {
  const x = h.replace('#', '');
  const full = x.length === 3 ? [...x].map((c) => c + c).join('') : x.slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
};
const doSang = (h) => { const [r, g, b] = kenh(h); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const tuongPhan = (a, b) => { const [x, y] = [doSang(a), doSang(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const datChuan = (fg, bg, ten, nguong = 4.5) => {
  const t = tuongPhan(fg, bg);
  assert.ok(t >= nguong, `${ten}: ${fg} trên ${bg} chỉ đạt ${t.toFixed(2)}:1 — cần ≥ ${nguong}:1`);
};
// Rút biến CSS từ MỘT khối :root{...} (không lồng ngoặc bên trong).
const bienCss = (khoi) => Object.fromEntries([...khoi.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\b/g)].map((m) => [m[1], m[2]]));
const khoiRoot = (src, truoc) => {
  const i = src.indexOf(truoc);
  assert.ok(i >= 0, `không thấy "${truoc}" — đổi hình CSS thì sửa test, đừng xoá`);
  const j = src.indexOf(':root{', i);
  return src.slice(j, src.indexOf('}', j) + 1);
};

test('mẫu Thực phẩm: chữ trắng trên màu chính + nhấn đọc được; chữ thường đọc được trên nền', () => {
  const t = PRESETS.food.tokens;
  datChuan('#ffffff', t['color.primary'], 'chữ trắng trên color.primary (nút, topbar, menu band, huy hiệu giỏ)');
  datChuan('#ffffff', t['color.accent'], 'chữ trắng trên color.accent (nhãn giảm giá)');
  datChuan(t['color.primary'], t['color.bg'], 'link/giá màu primary trên nền trang');
  for (const nen of ['color.bg', 'color.surface', 'color.hero-bg']) {
    datChuan(t['color.text'], t[nen], `color.text trên ${nen}`);
    datChuan(t['color.muted'], t[nen], `color.muted trên ${nen}`);
  }
});

test('trang thanh toán: nút chính đọc được ở CẢ chế độ sáng lẫn tối; link + chữ phụ đọc được', () => {
  const src = doc('apps/checkout/src/pages.js');
  const sang = bienCss(khoiRoot(src, 'const STYLE'));
  const toi = { ...sang, ...bienCss(khoiRoot(src, '@media(prefers-color-scheme:dark){')) };
  // Đọc ĐÚNG biến mà quy tắc .btn dùng — đổi .btn sang biến khác (vd --brand, vốn sáng lên ở
  // chế độ tối) thì phép đo đi theo, không đứng nhìn một biến không ai dùng.
  const btn = /\n\.btn\{[^}]*background:linear-gradient\(135deg,var\(--([a-z0-9-]+)\),var\(--([a-z0-9-]+)\)\)[^}]*color:#fff/.exec(src);
  assert.ok(btn, 'không thấy quy tắc .btn nền gradient + chữ trắng');
  for (const [che, bien] of [['sáng', sang], ['tối', toi]]) {
    for (const v of [btn[1], btn[2]]) datChuan('#ffffff', bien[v], `chế độ ${che}: chữ trắng trên nút (--${v})`);
    for (const nen of ['bg', 'surf', 'card']) {
      datChuan(bien.pri, bien[nen], `chế độ ${che}: link --pri trên --${nen}`);
      datChuan(bien.mut, bien[nen], `chế độ ${che}: chữ phụ --mut trên --${nen}`);
    }
    datChuan(bien.warn, bien.warnbg, `chế độ ${che}: huy hiệu chờ thanh toán`);
  }
});

test('tài khoản khách: nút chữ trắng trên --pri đọc được', () => {
  const v = bienCss(khoiRoot(doc('apps/account/src/views.js'), 'const STYLE'));
  datChuan('#ffffff', v.pri, 'chữ trắng trên nút --pri');
  datChuan(v.pri, v.bg, 'link --pri trên nền');
  datChuan(v.mut, v.bg, 'chữ phụ --mut trên nền');
});
