/**
 * Bất biến: form sửa MỘT PHẦN hồ sơ cửa hàng không được xoá thứ nó không hỏi.
 *
 * VÌ SAO CÓ. `PATCH /shops/:id` ghi đè cả 22 cột trong một câu UPDATE. Đường đó đúng cho form
 * Cài đặt đầy đủ, nhưng chết người với mọi form chỉ sửa vài ô: gửi 3 ô lên đó là đặt phí ship,
 * ngưỡng miễn phí ship, ngưỡng sắp hết hàng, trần đơn chờ, toạ độ gốc giao hàng và hạn ẩn danh
 * PII về NULL — HTTP 200, không log, không dấu vết. Chủ shop biết khi khách đặt hàng và thấy
 * phí ship bằng 0, lúc đó không còn cách nào biết giá trị cũ.
 *
 * Cách vá là endpoint theo NHÓM: `PATCH /shops/:id/settings/:section` chỉ chạm cột của nhóm.
 * Nhưng nó không miễn nhiễm — seller phân biệt bằng `sectionValue` (apps/seller/src/server.js):
 *
 *     khoá VẮNG MẶT trong body → giữ giá trị cũ
 *     khoá = ''                → ghi NULL
 *
 * nên một form gửi `''` cho ô nó KHÔNG có input vẫn xoá đúng cột đó, chỉ là phạm vi hẹp hơn.
 * Wizard onboarding là ca duy nhất kiểu này: nó ở trong nhóm `profile` (4 cột) nhưng chỉ hỏi 3.
 *
 * E2E không canh nổi lớp này một cách bền: nó chỉ khẳng định những cột người viết nghĩ ra hôm
 * đó, nên ngày thêm cột thứ 23 vào một nhóm, e2e vẫn xanh còn cột mới thì lặng lẽ bị xoá.
 * Phép kiểm phải neo vào chính DANH SÁCH CỘT của seller.
 *
 * Chạy: node --test apps/seller-admin/test/shop-patch.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SELLER_SRC = path.join(HERE, '..', '..', 'seller', 'src', 'server.js');
const ADMIN_SRC = path.join(HERE, '..', 'src', 'server.js');
const seller = () => fs.readFileSync(SELLER_SRC, 'utf8');
const admin = () => fs.readFileSync(ADMIN_SRC, 'utf8');

/** Bóc danh sách cột của câu `UPDATE shops SET … WHERE id = current_shop_id()` ghi-đè-toàn-bộ. */
function fullUpdateColumns() {
  // Neo vào `SET name = $1`: seller có nhiều câu `UPDATE shops SET` (activate, hồ sơ,
  // require_mfa, từng nhóm settings). Bản đầu của regex này vớ phải câu activate rồi nuốt sang
  // tận WHERE của câu sau — ra 2 cột thay vì 22, tức bộ test XANH GIẢ nếu ngưỡng đặt lỏng.
  const m = /UPDATE shops SET (name = \$1[\s\S]*?)WHERE id = current_shop_id\(\)/.exec(seller());
  assert.ok(m, 'không tìm thấy câu UPDATE ghi-đè-toàn-bộ trong seller — nếu nó bị đổi hình thì SỬA regex, đừng xoá test');
  return [...m[1].matchAll(/(\w+)\s*=\s*(?:\$\d+|COALESCE\(\$\d+)/g)].map((x) => x[1]);
}

/** Bóc `SETTINGS_SECTION_FIELDS` của BFF thành {nhóm: [cột]}. */
function sectionFields() {
  const m = /const SETTINGS_SECTION_FIELDS = \{([\s\S]*?)\n\};/.exec(admin());
  assert.ok(m, 'không tìm thấy SETTINGS_SECTION_FIELDS trong seller-admin');
  const out = {};
  for (const sec of m[1].matchAll(/(\w+):\s*\[([\s\S]*?)\]/g)) {
    // [a-z0-9_] chứ KHÔNG phải [a-z_]: `ship_extra_per_500g_vnd` có chữ số ở giữa. Bản đầu
    // của dòng này cắt tên cột tại chữ số và báo "cột không thuộc nhóm nào" — đỏ giả do
    // chính bộ test, đúng bẫy §4 "xanh/đỏ vì lý do sai".
    out[sec[1]] = [...sec[2].matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1]);
  }
  return out;
}

// Nhóm cài đặt RA ĐỜI SAU đường ghi-đè-toàn-bộ và cố ý KHÔNG nằm trong nó (0187: giờ nhận
// đơn). Form cũ `POST /settings` không có ô nào của nhóm này, nên nếu cột của nhóm lọt vào câu
// ghi-đè thì mỗi lần lưu form cũ là XOÁ giờ mở cửa / bỏ tạm nghỉ — đúng lớp lỗi bộ này sinh ra
// để chặn. Khai TƯỜNG MINH từng nhóm và các cột của nó; test dưới khẳng định cả hai chiều.
const NHOM_NGOAI_GHI_DE = {
  hours: ['orders_paused', 'orders_pause_note', 'order_open_time', 'order_close_time'],
};

test('nhóm ngoài đường ghi-đè: KHÔNG cột nào lọt vào câu ghi-đè, và seller có câu UPDATE riêng ghi ĐÚNG các cột đó', () => {
  const cols = fullUpdateColumns();
  const groups = sectionFields();
  for (const [nhom, cot] of Object.entries(NHOM_NGOAI_GHI_DE)) {
    assert.deepEqual(groups[nhom], cot, `BFF khai nhóm ${nhom} khác danh sách đã thống nhất`);
    const lot = cot.filter((c) => cols.includes(c));
    assert.deepEqual(lot, [], `cột của nhóm ${nhom} lọt vào đường ghi-đè-toàn-bộ — form cũ sẽ xoá chúng: ${lot.join(', ')}`);
    // Câu UPDATE riêng của nhóm: neo vào cột đầu tiên được gán $1.
    const m = new RegExp(`UPDATE shops\\s+SET (${cot[0]} = \\$1[\\s\\S]*?)WHERE id = current_shop_id\\(\\)`).exec(seller());
    assert.ok(m, `seller không có câu UPDATE riêng cho nhóm ${nhom}`);
    const ghi = [...m[1].matchAll(/(\w+)\s*=\s*\$\d+/g)].map((x) => x[1]);
    assert.deepEqual(ghi.sort(), [...cot].sort(), `câu UPDATE nhóm ${nhom} ghi khác các cột BFF gửi`);
  }
});

test('bốn nhóm settings phủ ĐÚNG mọi cột mà đường ghi-đè-toàn-bộ chạm tới', () => {
  const cols = fullUpdateColumns();
  assert.equal(cols.length, 22, `câu UPDATE ghi-đè có ${cols.length} cột, không phải 22`);
  const groups = Object.fromEntries(Object.entries(sectionFields()).filter(([k]) => !(k in NHOM_NGOAI_GHI_DE)));
  assert.deepEqual(Object.keys(groups).sort(), ['operations', 'privacy', 'profile', 'shipping'],
    'nhóm mới phải hoặc nằm trong đường ghi-đè, hoặc khai vào NHOM_NGOAI_GHI_DE — không được lơ lửng');
  const covered = Object.values(groups).flat();

  const missing = cols.filter((c) => !covered.includes(c));
  assert.deepEqual(missing, [], `cột KHÔNG thuộc nhóm nào → không màn Cài đặt nào sửa được: ${missing.join(', ')}`);
  const extra = covered.filter((c) => !cols.includes(c));
  assert.deepEqual(extra, [], `nhóm khai cột seller không ghi (thừa hoặc đã đổi tên): ${extra.join(', ')}`);

  // Một cột nằm ở HAI nhóm nghĩa là hai form cùng ghi nó và form lưu sau thắng — người bán
  // sửa ở màn này rồi lưu màn kia là mất thay đổi vừa rồi, không có lỗi nào hiện ra.
  const dup = covered.filter((c, i) => covered.indexOf(c) !== i);
  assert.deepEqual(dup, [], `cột nằm ở nhiều nhóm: ${dup.join(', ')}`);
});

test('seller phân biệt khoá VẮNG MẶT với khoá rỗng — nền tảng của mọi form sửa một phần', () => {
  // Nếu chốt này biến mất thì việc wizard bỏ qua contact_email không còn giữ được giá trị cũ,
  // và cả bộ test dưới đây mất ý nghĩa. Canh nó ở đây để hỏng là hỏng ra mặt.
  assert.match(seller(), /const sectionValue = \(body, current, key\) => hasOwn\(body, key\) \? body\[key\] : current\[key\]/,
    'sectionValue phải giữ giá trị cũ khi khoá VẮNG MẶT; đổi ngữ nghĩa này là đổi hợp đồng của mọi form sửa một phần');
});

test('wizard onboarding gửi ĐÚNG ô nó hỏi, không gửi rỗng cho ô nó không hỏi', () => {
  const m = /async function onboardingSave\(([\s\S]*?)\n}/.exec(admin());
  assert.ok(m, 'không tìm thấy onboardingSave trong seller-admin');
  const body = m[1];

  assert.match(body, /PATCH['"`],\s*`\/shops\/\$\{shopId\}\/settings\/profile`/,
    'wizard phải đi qua endpoint theo nhóm; PATCH /shops/:id là đường ghi đè cả 22 cột');
  assert.doesNotMatch(body, /PATCH['"`],\s*`\/shops\/\$\{shopId\}`/,
    'wizard KHÔNG được gọi đường ghi-đè-toàn-bộ');

  // Khẳng định trên ĐỐI SỐ THỰC, không phải trên object `patch`. Bản đầu của bộ này chỉ soi
  // các khoá của `patch`, nên đột biến `body: { ...patch, contact_email: '' }` ở chỗ GỌI vẫn
  // XANH — tức chốt đắt nhất không được canh. Đã đo: đột biến đó 4 pass / 0 fail.
  assert.match(body, /\{ cookie, body: patch \}/,
    'body gửi đi phải LÀ chính `patch`, không trải thêm khoá nào ở chỗ gọi');

  // Ba ô wizard có input thật; contact_email thì KHÔNG — nên nó phải vắng mặt khỏi `patch`.
  const sent = [...body.matchAll(/^\s{4}(\w+):/gm)].map((x) => x[1]);
  assert.deepEqual(sent.sort(), ['business_address', 'contact_phone', 'name'],
    'body của wizard phải đúng ba khoá có ô nhập');
  assert.ok(!sent.includes('contact_email'),
    'gửi contact_email rỗng = XOÁ email liên hệ của shop (sectionValue: "" → NULL)');

  // Và ba khoá đó phải nằm trong nhóm profile, nếu không seller sẽ bỏ qua chúng.
  const profile = sectionFields().profile;
  for (const k of sent) assert.ok(profile.includes(k), `${k} không thuộc nhóm profile`);
});

test('form Cài đặt đầy đủ vẫn gửi TRỌN nhóm — ngược lại với wizard, và cố ý', () => {
  // settingsSectionSave dựng body bằng `String(form[field] ?? '')` cho MỌI cột của nhóm, tức
  // ô bỏ trống ghi NULL. Đúng ở đây vì mỗi cột đều có input trên màn hình: bỏ trống LÀ ý định
  // xoá. Ghi lại đối lập này để không ai "thống nhất" hai đường về một kiểu.
  const m = /async function settingsSectionSave\(([\s\S]*?)\n}/.exec(admin());
  assert.ok(m, 'không tìm thấy settingsSectionSave trong seller-admin');
  assert.match(m[1], /Object\.fromEntries\(fields\.map\(/,
    'form đầy đủ phải gửi trọn danh sách cột của nhóm');
});
