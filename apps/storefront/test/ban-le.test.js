/**
 * Cửa hàng BÁN LẺ kiểu sàn (31/10/2026, docs/83): sản phẩm lên màn đầu điện thoại, thẻ có nhãn
 * thật, và KHÔNG lời hứa nào nói thay shop. Chạy thẳng ở máy, không cần stack:
 *   node --test apps/storefront/test/ban-le.test.js
 *
 * Khẳng định đặt trên HTML đã render (bề mặt khách thấy), bỏ <style>/<script> trước khi khớp —
 * chú thích CSS có chứa chữ mẫu, khớp trên toàn văn bản là xanh/đỏ vì lý do sai (sổ tay §4).
 * Phần bố cục (tràn ngang, thẻ đầu tiên ở y=?) KHÔNG đo được ở đây: phép đo thật là ảnh chụp
 * 390×844 / 1366×800 cho cả 5 mẫu, ghi trong docs/83.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { renderHome, renderProducts, renderProduct, DEFAULT_FEATURES } from '../src/theme.js';
import { getPreset } from '../../../packages/presets/src/index.js';

const SRC = fs.readFileSync(new URL('../src/theme.js', import.meta.url), 'utf8');
const ADMIN = fs.readFileSync(new URL('../../seller-admin/src/pages.js', import.meta.url), 'utf8');
const visible = (html) => html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<script[\s\S]*?<\/script>/g, '');

const P = (o = {}) => ({
  id: `id-${o.slug ?? 'x'}`, slug: 'x', title: 'Sản phẩm', price_vnd: 100000, compare_at_vnd: null,
  sale_price_vnd: null, sale_off_pct: null, image: '/i.webp', image2: null, available: 5,
  has_options: false, default_variant_id: 'v1', sold_count: 0, rating_avg: null, rating_count: 0, ...o,
});
const CATS = [{ slug: 'ao', name: 'Áo', children: [] }, { slug: 'quan', name: 'Quần', children: [{ slug: 'jean', name: 'Jean' }] }];
const ctxOf = (o = {}) => ({ shop: { name: 'Shop Thử' }, theme: null, products: [P({ slug: 'a' })], categories: CATS, nonce: '', ...o });
const pi = (o = {}) => ({ total: 1, offset: 0, pageSize: 24, basePath: '/products', sort: 'new', filters: {}, filterable: true, ...o });
// Cắt từng thẻ theo ĐÚNG khối của nó (không khớp cả trang): mỗi thẻ bắt đầu bằng <div class="card…">.
const cards = (html) => visible(html).split(/(?=<div class="card(?: is-out)?">)/).slice(1).map((c) => c.split('</div>\n        </div>')[0]);

// Cụm hứa hẹn: chính sách RIÊNG từng shop, nền tảng không bảo đảm thay được.
const HUA = /giao hàng toàn quốc|toàn quốc|đổi trả|hoàn tiền|bảo hành|chính hãng|freeship|miễn phí giao|showroom|vietgap/i;

test('cam kết mặc định: storefront và trang Giao diện của admin là CÙNG một bảng', () => {
  const block = ADMIN.slice(ADMIN.indexOf('export const THEME_FEATURE_DEFAULTS = ['), ADMIN.indexOf('];', ADMIN.indexOf('export const THEME_FEATURE_DEFAULTS = [')));
  const admin = [...block.matchAll(/\{ icon: '(\w+)', title: '([^']*)', desc: '([^']*)' \}/g)].map((m) => ({ icon: m[1], title: m[2], desc: m[3] }));
  assert.equal(admin.length, 4, 'không rút được 4 dòng THEME_FEATURE_DEFAULTS — đổi định dạng thì sửa chốt này');
  assert.deepEqual(admin, DEFAULT_FEATURES);
});

test('cam kết mặc định chỉ nói điều nền tảng bảo đảm (không hứa chính sách thay shop)', () => {
  for (const f of DEFAULT_FEATURES) {
    assert.doesNotMatch(`${f.title} ${f.desc}`, HUA, `cam kết mặc định hứa thay shop: ${f.title}`);
  }
});

test('trang chủ / tất cả SP / trang SP của shop chưa sửa gì: không câu hứa nào', () => {
  const ctx = ctxOf();
  const prod = { ...P({ slug: 'a' }), variants: [{ id: 'v1', price_vnd: 100000, available: 5, values: {} }], options: [], media: [] };
  for (const [ten, html] of [['trang chủ', renderHome(ctx)], ['tất cả SP', renderProducts({ ...ctx, pageInfo: pi() })], ['trang SP', renderProduct(ctx, prod)]]) {
    const v = visible(html);
    const m = v.replace(/<[^>]+>/g, ' ').match(HUA);
    assert.equal(m, null, `${ten} còn câu hứa: "${m?.[0]}"`);
  }
});

test('thanh thông báo chỉ hiện khi shop TỰ viết', () => {
  assert.doesNotMatch(visible(renderHome(ctxOf())), /class="topbar"/, 'shop chưa viết mà vẫn có thanh thông báo');
  const own = ctxOf({ theme: { layout: [{ section: 'header', props: { topbar_text: 'Freeship đơn từ 300.000₫' } }] } });
  assert.match(visible(renderHome(own)), /<div class="topbar">Freeship đơn từ 300\.000₫<\/div>/);
});

test('shop sửa cam kết → trang SP và chân trang nói ĐÚNG câu của shop, không câu in cứng', () => {
  const items = [
    { icon: 'truck', title: 'Freeship từ 300k', desc: 'a' }, { icon: 'return', title: 'Đổi size 3 ngày', desc: 'b' },
    { icon: 'badge', title: 'Kiểm hàng khi nhận', desc: 'c' }, { icon: 'wallet', title: 'Gói quà miễn phí', desc: 'd' },
  ];
  const ctx = ctxOf({ theme: { layout: [{ section: 'header', props: {} }, { section: 'hero', props: {} }, { section: 'features', props: { items } }, { section: 'footer', props: {} }] } });
  const prod = { ...P({ slug: 'a' }), variants: [{ id: 'v1', price_vnd: 100000, available: 5, values: {} }], options: [], media: [] };
  const trust = visible(renderProduct(ctx, prod)).match(/<div class="trust">([\s\S]*?)<\/div>/)?.[1] ?? '';
  for (const t of items.slice(0, 3)) assert.ok(trust.includes(t.title), `trang SP thiếu "${t.title}"`);
  assert.ok(!trust.includes(DEFAULT_FEATURES[0].title), 'trang SP vẫn in câu mặc định khi shop đã sửa');
  const badges = visible(renderHome(ctx)).match(/<div class="badges">([\s\S]*?)<\/div>/)?.[1] ?? '';
  assert.ok(badges.includes(items[0].title) && badges.includes(items[1].title), 'chân trang không theo cam kết của shop');
});

test('thẻ: "-N%" và "Bán chạy" chỉ từ dữ liệu thật; hết hàng chỉ một nhãn', () => {
  const html = renderProducts(ctxOf({
    pageInfo: pi({ total: 6 }),
    products: [
      P({ slug: 'thuong' }),
      P({ slug: 'gach', compare_at_vnd: 125000 }),
      P({ slug: 'sale', sale_price_vnd: 70000, sale_off_pct: 30, compare_at_vnd: 125000 }),
      P({ slug: 'ban49', sold_count: 49 }),
      P({ slug: 'ban50', sold_count: 50 }),
      P({ slug: 'het', available: 0, compare_at_vnd: 125000, sold_count: 500 }),
    ],
  }));
  const c = Object.fromEntries(cards(html).map((x) => [x.match(/href="\/p\/([^"]+)"/)[1], x]));
  assert.doesNotMatch(c.thuong, /c-tags/, 'thẻ không giảm/không bán chạy vẫn có nhãn');
  assert.match(c.gach, /<span class="c-tag c-off">-20%<\/span>/, 'giá gạch 125k → bán 100k phải là -20%');
  assert.match(c.sale, /<span class="c-tag c-off">-30%<\/span>/, 'flash sale phải lấy sale_off_pct, không lấy giá gạch');
  assert.match(c.sale, /<strong>70\.000₫<\/strong> <s class="cmp">100\.000₫<\/s>/, 'flash sale gạch GIÁ GỐC');
  assert.doesNotMatch(c.ban49, /c-hot/, '49 đã bán chưa phải "Bán chạy"');
  assert.match(c.ban50, /<span class="c-tag c-hot">Bán chạy<\/span>/, 'đủ ngưỡng mà không có nhãn');
  assert.match(c.het, /soldout-tag">Hết hàng/);
  assert.doesNotMatch(c.het, /c-tags/, 'hết hàng vẫn mời bằng nhãn giảm giá / bán chạy');
  // Ô % đã lên góc ảnh: dòng giá trong thân thẻ không được còn ô .off (xuống dòng ở thẻ 145px).
  for (const [slug, x] of Object.entries(c)) {
    const price = x.match(/<div class="price">([\s\S]*?)<\/div>/)[1];
    assert.doesNotMatch(price, /class="off"/, `thẻ ${slug}: ô % vẫn nằm trong dòng giá`);
  }
});

test('/products: không còn bộ lọc MỞ SẴN; nút Lọc đóng kể cả khi đang lọc; thứ tự đọc = thứ tự nhìn', () => {
  const html = visible(renderProducts(ctxOf({ pageInfo: pi({ filters: { instock: true, pmin: 100000 } }) }), { catSlug: null }));
  assert.doesNotMatch(html, /<details[^>]*\bopen\b/, 'còn <details open> — điện thoại sẽ mở sẵn bộ lọc cao ~1150px');
  assert.match(html, /<aside class="pf-side"/);
  assert.match(html, /<details class="pf-mfilter">[\s\S]*?<span>Lọc · 2<\/span>/, 'nhãn Lọc phải đếm 2 điều kiện đang áp');
  const iCount = html.indexOf('class="pf-count"'), iLoc = html.indexOf('class="pf-mfilter"'), iSort = html.indexOf('class="sortbar"');
  assert.ok(iCount > 0 && iCount < iLoc && iLoc < iSort, 'DOM phải là: đếm → Lọc → sắp xếp (không dùng CSS order)');
  const chips = html.match(/<nav class="pf-chips" aria-label="Danh mục">([\s\S]*?)<\/nav>/)?.[1] ?? '';
  assert.match(chips, /<a class="pf-chip on" href="\/products\?instock=1&amp;pmin=100000" aria-current="true">Tất cả<\/a>/, 'chip Tất cả phải giữ bộ lọc đang áp');
  assert.match(chips, />Áo</);
});

test('/products?cat=<con>: hàng chip con, cha được tô, chip con đang xem có aria-current', () => {
  const html = visible(renderProducts(ctxOf({ pageInfo: pi(), activeCatName: 'Jean' }), { catSlug: 'jean' }));
  assert.match(html, /<a class="pf-chip on" href="\/products\?cat=quan">Quần<\/a>/);
  const sub = html.match(/<nav class="pf-chips pf-chips-sub"[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? '';
  assert.match(sub, />Tất cả Quần</);
  assert.match(sub, /<a class="pf-chip on" href="\/products\?cat=jean" aria-current="true">Jean<\/a>/);
});

test('hero: nút "Bộ sưu tập" chỉ khi trang chủ CÓ khối #bo-suu-tap', () => {
  const coKhoi = visible(renderHome(ctxOf())); // bố cục mặc định tự chèn collections
  assert.match(coKhoi, /id="bo-suu-tap"/);
  assert.match(coKhoi, /href="#bo-suu-tap">Bộ sưu tập</);
  const mau = visible(renderHome(ctxOf({ theme: { layout: getPreset('fashion').layout } })));
  assert.doesNotMatch(mau, /id="bo-suu-tap"/, 'mẫu thời trang không có khối collections (đổi mẫu thì sửa ca này)');
  assert.doesNotMatch(mau, /href="#bo-suu-tap"/, 'nút trỏ tới khối không tồn tại');
});

// Chốt CHÍNH TẢ mức mã nguồn — nói thẳng giới hạn: nó chỉ giữ đúng dòng CSS đã đo là cần.
// Phép đo thật là ảnh chụp + probe tràn ngang (scripts/probe-360.mjs) ở 360/390.
test('CSS: lề ngang của <main class="wrap section"> và cột lưới minmax(0,1fr) ở điện thoại', () => {
  assert.match(SRC, /\.wrap\.section\{padding-left:24px;padding-right:24px\}/);
  const m860 = SRC.slice(SRC.indexOf('@media(max-width:860px){\n  .wrap.section.pf-page'));
  assert.match(m860.slice(0, 3000), /\.pf-layout\{grid-template-columns:minmax\(0,1fr\)/);
  assert.match(m860.slice(0, 3000), /\.pf-side\{display:none\}/);
  // Trang SP ở 320px: cột thông tin co được (không thì thanh mua nowrap đẩy trang cuộn ngang
  // 31px), và ô chọn ảnh của form đánh giá không vượt bề rộng nội tại 378px.
  const m720 = SRC.slice(SRC.indexOf('@media(max-width:720px){.pd-grid'));
  assert.match(m720.slice(0, 2500), /\.pd-grid\{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(SRC, /\.rv-form input\[type=file\]\{max-width:100%\}/);
});

// ── Giỏ hàng (apps/checkout) — chung cho mọi ngành ───────────────────────────
// Nạp mã render thật qua data URL, thay hai import không liên quan tới HTML (cùng cách
// apps/checkout/test/vietqr.test.js làm) — để bộ này vẫn chạy trên máy chưa `npm install`.
const CO_SRC = fs.readFileSync(new URL('../../checkout/src/pages.js', import.meta.url), 'utf8');
const coPages = import(`data:text/javascript;base64,${Buffer.from(CO_SRC
  .replace("import QRCode from 'qrcode';", "const QRCode = { toString: async () => '' };")
  .replace("import { PROVINCES } from './provinces.js';", "const PROVINCES = ['Hà Nội'];"), 'utf8').toString('base64')}`);
const gio = (items) => ({ items, subtotal_vnd: 0, shipping_vnd: 0, discount_vnd: 0, points_discount_vnd: 0, total_vnd: 0, checkout_policy: { discounts_allowed: true } });
const dong = (o = {}) => ({ variant_id: '11111111-1111-4111-8111-111111111111', product_title: 'Áo thun', variant_title: null, qty: 2, unit_price_vnd: 100000, line_total_vnd: 200000, ...o });
// Cắt đúng form của MỘT dòng giỏ, không khớp cả trang.
const formsGio = (html) => [...html.matchAll(/<form method="POST" action="\/cart\/update"[\s\S]*?<\/form>/g)].map((m) => m[0]);

test('giỏ: −/+ là nút submit mang SỐ LƯỢNG ĐÍCH (không JS, bấm lặp không cộng dồn); Xoá gửi 0', async () => {
  const { renderCart } = await coPages;
  const [f] = formsGio(renderCart('Shop', gio([dong({ qty: 2 })])));
  assert.ok(f, 'không thấy form /cart/update của dòng giỏ');
  // Không còn ô gõ số: ô gõ + nút mang qty sẽ gửi HAI giá trị qty, server chỉ đọc một.
  assert.doesNotMatch(f, /<input[^>]*name="qty"/, 'còn ô nhập qty cạnh nút −/+');
  const vals = [...f.matchAll(/<button[^>]*type="submit"[^>]*name="qty" value="(\d+)"[^>]*>([^<]*)</g)].map((m) => [m[2].trim(), m[1]]);
  assert.deepEqual(vals, [['−', '1'], ['+', '3'], ['Xoá', '0']], `nút giỏ sai: ${JSON.stringify(vals)}`);
  assert.match(f, /name="variant_id" value="11111111-1111-4111-8111-111111111111"/);
  assert.match(f, /<span class="sr">Số lượng <\/span>2</, 'số lượng hiện tại không có nhãn cho trình đọc màn hình');
});

test('giỏ: dòng 1 sản phẩm thì "−" về 0 (bỏ khỏi giỏ); trần 1000 khoá nút "+" thay vì gửi 1001 vào trang lỗi', async () => {
  const { renderCart } = await coPages;
  const [mot] = formsGio(renderCart('Shop', gio([dong({ qty: 1 })])));
  assert.match(mot, /name="qty" value="0" aria-label="Bỏ Áo thun">−</);
  const [tran] = formsGio(renderCart('Shop', gio([dong({ qty: 1000 })])));
  assert.match(tran, /name="qty" value="1000" aria-label="Tăng số lượng Áo thun" disabled>\+</, 'nút + ở trần 1000 không bị khoá');
  const [duoi] = formsGio(renderCart('Shop', gio([dong({ qty: 999 })])));
  assert.match(duoi, /name="qty" value="1000" aria-label="Tăng số lượng Áo thun">\+</, 'nút + dưới trần bị khoá nhầm');
});

test('đầu trang giỏ/thanh toán: tên shop chữ đặc một dòng; hai lối tắt có chữ trong HTML', async () => {
  const { renderCart } = await coPages;
  const html = renderCart('Shop <Thử>', gio([dong()]));
  assert.match(html, /<a class="brand" href="\/">Shop &lt;Thử&gt;<\/a>/);
  assert.match(html, /<a href="\/checkout\/lookup"><svg[^>]*aria-hidden="true"[\s\S]*?<\/svg><span>Tra cứu đơn<\/span><\/a>/);
  assert.match(html, /<a href="\/cart" class="cart"><svg[^>]*aria-hidden="true"[\s\S]*?<\/svg><span>Giỏ hàng<\/span><\/a>/);
  const brand = /\n\.brand\{([^}]*)\}/.exec(CO_SRC)?.[1] ?? '';
  assert.match(brand, /white-space:nowrap/, 'tên shop dài lại gãy hai dòng');
  assert.match(brand, /text-overflow:ellipsis/);
  assert.doesNotMatch(brand, /background-clip:text|color:transparent/, 'tên shop quay lại chữ gradient khác cửa hàng');
  assert.match(CO_SRC, /\.hnav a\{[^}]*white-space:nowrap/, '"Tra cứu đơn" lại gãy dòng');
  assert.match(CO_SRC, /\.cline\{display:grid;grid-template-columns:56px minmax\(0,1fr\) auto;/, 'cột giữa dòng giỏ không co được');
});
