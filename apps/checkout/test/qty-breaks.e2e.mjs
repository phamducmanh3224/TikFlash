// E2E: GIÁ THEO SỐ LƯỢNG (0188) — "mua càng nhiều càng rẻ". Đi đủ đường tiền: API đặt bậc →
// giỏ (summarize) → chốt đơn (createOrderTx) → snapshot order_lines → trang sản phẩm.
// Khẳng định đặt trên CỘT TIỀN THẬT của đơn (subtotal_vnd, unit_price_vnd) và trên HTML khách
// thấy, không trên phản hồi trung gian (§4: đo hậu quả ở đúng bề mặt).
import http from 'node:http';
import pg from 'pg';
import { totp, counterFor } from '../../../packages/auth/src/totp.js';
import { base32Decode } from '../../../packages/auth/src/base32.js';

const AUTH = 'http://auth:3020', PLATFORM = 'http://platform:3030', SELLER = 'http://seller:3040';
const CO = new URL('http://checkout:3060');
const OA = 'https://auth.localtest', OO = 'https://ops.localtest', OS = 'https://seller.localtest';
const owner = new pg.Pool({ connectionString: process.env.DATABASE_URL_OWNER, max: 5 });
const inviteTokenOf = async (email) => { const { rows } = await owner.query(`SELECT payload->>'accept_url' AS u FROM outbox WHERE topic='user.invited' AND payload->>'to'=$1 ORDER BY id DESC LIMIT 1`, [email]); return rows[0]?.u ? new URL(rows[0].u).searchParams.get('token') : null; };
let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  PASS ' + m); };
const bad = (m, d) => { fail++; console.log('  FAIL ' + m + (d ? ' :: ' + String(d).slice(0, 220) : '')); };
const sect = (m) => console.log('\n# ' + m);
const uniq = () => Math.random().toString(36).slice(2, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ck = (sc) => { for (const c of sc ?? []) { const m = /^__Host-session=([^;]*)/.exec(c); if (m) return m[1]; } return null; };
async function rq(base, method, path, { body, cookie, origin } = {}) {
  const h = {}; if (body !== undefined) h['content-type'] = 'application/json';
  if (origin) h.origin = origin; if (cookie) h.cookie = `__Host-session=${cookie}`;
  const r = await fetch(base + path, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch {}
  return { status: r.status, json: j, sc: r.headers.getSetCookie(), raw: t };
}
const login = async (e, p) => ck((await rq(AUTH, 'POST', '/auth/login', { body: { email: e, password: p }, origin: OA })).sc);
const uidOf = async (e) => (await owner.query('SELECT id FROM users WHERE email=$1', [e])).rows[0]?.id ?? null;
let HOST;
// hreq: JSON hoặc form-urlencoded; trả status/json/body/location/cartCookie.
function hreq(method, path, { json, form, cartCookie, idem, accept } = {}) {
  return new Promise((resolve, reject) => {
    let data = null, ctype = null;
    if (json !== undefined) { data = JSON.stringify(json); ctype = 'application/json'; }
    else if (form !== undefined) { data = new URLSearchParams(form).toString(); ctype = 'application/x-www-form-urlencoded'; }
    const headers = { host: HOST, origin: `https://${HOST}` };
    if (accept) headers.accept = accept;
    if (data != null) { headers['content-type'] = ctype; headers['content-length'] = Buffer.byteLength(data); }
    if (cartCookie) headers.cookie = `__Host-cart=${cartCookie}`;
    if (idem) headers['idempotency-key'] = idem;
    const req = http.request({ hostname: CO.hostname, port: CO.port, path, method, headers }, (rs) => {
      let b = ''; rs.on('data', (d) => (b += d)); rs.on('end', () => { let j = null; try { j = b ? JSON.parse(b) : null; } catch {} let tok = cartCookie; for (const c of rs.headers['set-cookie'] ?? []) { const m = /^__Host-cart=([^;]*)/.exec(c); if (m) tok = m[1]; } resolve({ status: rs.statusCode, json: j, body: b, location: rs.headers.location, cartCookie: tok }); });
    });
    req.on('error', reject); if (data != null) req.write(data); req.end();
  });
}
async function makeStaff() {
  const email = `staff-${uniq()}@nentang.vn`, password = 'staff strong passphrase';
  await rq(AUTH, 'POST', '/auth/register', { body: { email, password }, origin: OA });
  let c = await login(email, password);
  const en = await rq(AUTH, 'POST', '/auth/mfa/enroll', { cookie: c, origin: OA });
  const key = base32Decode(en.json.secret);
  await rq(AUTH, 'POST', '/auth/mfa/activate', { cookie: c, body: { code: totp(key, {}) }, origin: OA });
  const c0 = counterFor(Date.now());
  await owner.query(`INSERT INTO platform_staff (user_id,role) VALUES ($1,'admin')`, [await uidOf(email)]);
  while (counterFor(Date.now()) <= c0) await sleep(1000);
  c = await login(email, password);
  return ck((await rq(AUTH, 'POST', '/auth/mfa/verify', { cookie: c, body: { code: totp(key, {}) }, origin: OA })).sc) ?? c;
}
const N = (x) => (x == null ? null : Number(x));
const W = ["now() - interval '1 hour'", "now() + interval '1 hour'"];
const mkPromo = (shopId, kind, value) => owner.query(
  `INSERT INTO promotions (shop_id,title,kind,value,scope,starts_at,ends_at,active)
   VALUES ($1,'Flash',$2,$3,'all',${W[0]},${W[1]},true) RETURNING id`, [shopId, kind, value]).then((r) => r.rows[0].id);
const offPromo = (id) => owner.query(`UPDATE promotions SET active=false WHERE id=$1`, [id]);
const STORE = new URL(process.env.STOREFRONT_URL ?? 'http://storefront:3050');
const storeGet = (path) => new Promise((resolve, reject) => {
  const q = http.request({ hostname: STORE.hostname, port: STORE.port, path, method: 'GET', headers: { host: HOST } }, (rs) => {
    let b = ''; rs.on('data', (d) => (b += d)); rs.on('end', () => resolve({ status: rs.statusCode, body: b }));
  });
  q.on('error', reject); q.end();
});

async function main() {
  const staff = await makeStaff();
  const slug = `qb-${uniq()}`;
  let r = await rq(PLATFORM, 'POST', '/ops/shops', { body: { name: slug, slug, plan_code: 'platform' }, cookie: staff, origin: OO });
  const shopId = r.json.id; HOST = `${slug}.nentang.vn`;
  await owner.query(`UPDATE shops SET status='active', went_live_at=now() WHERE id=$1`, [shopId]);
  const oe = `owner-${uniq()}@shop.vn`, op = 'owner passphrase strong';
  await rq(PLATFORM, 'POST', `/ops/shops/${shopId}/invitations`, { body: { email: oe, role: 'owner' }, cookie: staff, origin: OO });
  await rq(AUTH, 'POST', '/auth/invitations/accept', { body: { token: await inviteTokenOf(oe), password: op }, origin: OA });
  const oc = await login(oe, op);
  // Sản phẩm NHIỀU biến thể (size) — đúng hình dạng hàng quần áo. Giá từng biến thể có thể khác.
  const mk = async (prices) => {
    const pslug = `ao-${uniq()}`;
    const p = await rq(SELLER, 'POST', `/shops/${shopId}/products`, { body: { title: `Áo ${uniq()}`, slug: pslug, price_vnd: prices[0], status: 'active',
      variants: prices.map((pr) => ({ sku: `S-${uniq()}`, price_vnd: pr })) }, cookie: oc, origin: OS });
    const vs = (await rq(SELLER, 'GET', `/shops/${shopId}/products/${p.json.id}`, { cookie: oc })).json.variants;
    for (const v of vs) await rq(SELLER, 'POST', `/shops/${shopId}/variants/${v.id}/inventory/adjust`, { body: { delta: 200, reason: 'nhập' }, cookie: oc, origin: OS });
    return { id: p.json.id, slug: pslug, v: vs.map((v) => v.id) };
  };
  const putQb = (pid, rows) => rq(SELLER, 'PUT', `/shops/${shopId}/products/${pid}/qty-breaks`, { body: { qty_breaks: rows }, cookie: oc, origin: OS });
  const lastOrder = async () => (await owner.query(`SELECT id, subtotal_vnd, total_vnd FROM orders WHERE shop_id=$1 ORDER BY created_at DESC LIMIT 1`, [shopId])).rows[0];
  const linesOf = async (oid) => (await owner.query(`SELECT variant_id, unit_price_vnd, orig_unit_price_vnd, promotion_id, qty FROM order_lines WHERE order_id=$1 ORDER BY variant_id`, [oid])).rows;
  let phoneN = 10;
  const fillCart = async (items) => { let cart = null; for (const [v, q] of items) cart = (await hreq('POST', '/cart/items', { json: { variant_id: v, qty: q }, cartCookie: cart })).cartCookie; return cart; };
  const order = async (items) => {
    const cart = await fillCart(items);
    const res = await hreq('POST', '/checkout', { json: { customer: { name: 'K', phone: `09000000${phoneN++}`, email: 'k@x.vn' }, address: { line: 'x', province: 'Hà Nội' }, payment_method: 'cod' }, cartCookie: cart, idem: `i-${uniq()}` });
    // Dọn pending để trần chống đơn ảo theo IP không chen vào giữa các mục.
    await owner.query(`UPDATE orders SET status='confirmed' WHERE shop_id=$1 AND status='pending'`, [shopId]);
    return res;
  };
  const byV = (ls) => Object.fromEntries(ls.map((l) => [l.variant_id, l]));

  const A = await mk([100000, 120000]);   // size M 100k, size XL 120k
  const B = await mk([100000, 85000]);    // một size VỐN rẻ hơn bậc

  sect('1. API đặt bậc: hợp lệ lưu được, đọc lại đúng thứ tự');
  r = await putQb(A.id, [{ min_qty: '10', price_vnd: '80.000' }, { min_qty: 3, price_vnd: 90000 }]);
  r.status === 400 && /mức 2/.test(r.json?.error) ? ok('mức "mua từ" không tăng dần → 400, chỉ đúng mức 2 (thứ tự người bán gõ)') : bad('không chặn bậc lộn thứ tự', JSON.stringify(r.json));
  r = await putQb(A.id, [{ min_qty: 3, price_vnd: 90000 }, { min_qty: 10, price_vnd: 80000 }, { min_qty: '', price_vnd: '' }]);
  r.status === 200 ? ok('PUT 2 bậc (+1 dòng trống bị bỏ qua) → 200') : bad('PUT bậc hợp lệ hỏng', `${r.status} ${JSON.stringify(r.json)}`);
  let g = await rq(SELLER, 'GET', `/shops/${shopId}/products/${A.id}`, { cookie: oc });
  JSON.stringify(g.json.qty_breaks) === JSON.stringify([{ min_qty: 3, price_vnd: 90000 }, { min_qty: 10, price_vnd: 80000 }])
    ? ok('GET sản phẩm trả qty_breaks dạng SỐ, xếp tăng dần') : bad('qty_breaks đọc lại sai', JSON.stringify(g.json.qty_breaks));
  const sai = [
    [[{ min_qty: 1, price_vnd: 90000 }], /mức 1/, '"mua từ" = 1'],
    [[{ min_qty: 3, price_vnd: 120000 }], /thấp hơn giá bán/, 'giá bậc ≥ giá bán cao nhất'],
    [[{ min_qty: 3, price_vnd: 90000 }, { min_qty: 5, price_vnd: 95000 }], /mức 2.*thấp hơn mức trên/, 'giá không giảm dần'],
    [[{ min_qty: 3, price_vnd: 'abc' }], /mức 1/, 'giá không phải số'],
    [Array.from({ length: 6 }, (_, i) => ({ min_qty: i + 2, price_vnd: 99000 - i * 1000 })), /tối đa 5/, '6 bậc'],
  ];
  for (const [rows, re, ten] of sai) {
    r = await putQb(A.id, rows);
    r.status === 400 && re.test(r.json?.error ?? '') ? ok(`chặn ${ten} → 400 "${r.json.error}"`) : bad(`không chặn ${ten}`, `${r.status} ${JSON.stringify(r.json)}`);
  }
  g = await rq(SELLER, 'GET', `/shops/${shopId}/products/${A.id}`, { cookie: oc });
  g.json.qty_breaks.length === 2 ? ok('lượt PUT hỏng KHÔNG xoá bảng bậc đang có') : bad('PUT hỏng làm mất bậc cũ', JSON.stringify(g.json.qty_breaks));

  sect('2. Chưa đủ bậc → giá gốc');
  await order([[A.v[0], 1], [A.v[1], 1]]);
  let o = await lastOrder(); let ls = byV(await linesOf(o.id));
  N(o.subtotal_vnd) === 220000 && ls[A.v[0]].orig_unit_price_vnd === null ? ok('2 cái (M+XL): 100k + 120k = 220k, không bậc') : bad('2 cái tính sai', `${o.subtotal_vnd}`);

  sect('3. GỘP size: 2 M + 1 XL = 3 cái → bậc 3 cho CẢ HAI size');
  await order([[A.v[0], 2], [A.v[1], 1]]);
  o = await lastOrder(); ls = byV(await linesOf(o.id));
  N(o.subtotal_vnd) === 270000 && N(ls[A.v[0]].unit_price_vnd) === 90000 && N(ls[A.v[1]].unit_price_vnd) === 90000
    && N(ls[A.v[0]].orig_unit_price_vnd) === 100000 && N(ls[A.v[1]].orig_unit_price_vnd) === 120000 && ls[A.v[0]].promotion_id === null
    ? ok('3 cái khác size: mỗi cái 90k, subtotal 270k, orig = giá gốc từng size, promotion_id NULL') : bad('gộp size sai', `${o.subtotal_vnd} ${JSON.stringify(ls)}`);

  sect('4. Bậc cao nhất đã đạt áp cho CẢ số lượng');
  await order([[A.v[0], 6], [A.v[1], 4]]);
  o = await lastOrder();
  N(o.subtotal_vnd) === 800000 ? ok('10 cái → 80k/cái = 800k (không chia lũy tiến)') : bad('bậc 10 sai', o.subtotal_vnd);

  sect('5. Biến thể vốn RẺ hơn bậc giữ giá biến thể');
  await putQb(B.id, [{ min_qty: 3, price_vnd: 90000 }]);
  await order([[B.v[0], 1], [B.v[1], 2]]);
  o = await lastOrder(); ls = byV(await linesOf(o.id));
  N(ls[B.v[0]].unit_price_vnd) === 90000 && N(ls[B.v[1]].unit_price_vnd) === 85000 && ls[B.v[1]].orig_unit_price_vnd === null && N(o.subtotal_vnd) === 260000
    ? ok('size 100k → 90k; size 85k giữ 85k (orig NULL) — bậc không làm dòng đắt lên') : bad('bậc làm dòng rẻ đắt lên', `${o.subtotal_vnd} ${JSON.stringify(ls)}`);

  sect('6. Flash sale vs bậc: lấy giá THẤP hơn, không cộng dồn');
  let pr = await mkPromo(shopId, 'percent', 50);
  await order([[A.v[0], 3]]);
  o = await lastOrder(); ls = await linesOf(o.id);
  N(ls[0].unit_price_vnd) === 50000 && ls[0].promotion_id === pr ? ok('sale 50% (50k) rẻ hơn bậc 90k → 50k, promotion_id của sale') : bad('sale vs bậc sai', JSON.stringify(ls[0]));
  await offPromo(pr);
  pr = await mkPromo(shopId, 'percent', 5);
  await order([[A.v[0], 3]]);
  o = await lastOrder(); ls = await linesOf(o.id);
  N(ls[0].unit_price_vnd) === 90000 && ls[0].promotion_id === null ? ok('sale 5% (95k) đắt hơn bậc → 90k, promotion_id NULL (không 85.5k cộng dồn)') : bad('bậc vs sale nhẹ sai', JSON.stringify(ls[0]));
  await offPromo(pr);

  sect('7. Giỏ nói đúng giá + nhắc bậc kế tiếp');
  let cart = await fillCart([[A.v[0], 1], [A.v[1], 1]]);
  let s = (await hreq('GET', '/cart', { cartCookie: cart })).json;
  s.subtotal_vnd === 220000 && s.items[0].qty_break_next?.more === 1 && s.items[0].qty_break_next?.price_vnd === 90000
    ? ok('giỏ 2 cái: subtotal 220k, nhắc "thêm 1 cái được 90k"') : bad('giỏ chưa nhắc bậc', JSON.stringify(s.items?.[0]));
  let html = (await hreq('GET', '/cart', { cartCookie: cart, accept: 'text/html' })).body;
  (html.match(/class="qb-next"/g) ?? []).length === 1 ? ok('lời nhắc in MỘT lần cho cả mẫu (2 dòng size)') : bad('lời nhắc lặp theo dòng', (html.match(/class="qb-next"/g) ?? []).length);
  cart = await fillCart([[A.v[0], 3]]);
  s = (await hreq('GET', '/cart', { cartCookie: cart })).json;
  s.subtotal_vnd === 270000 && s.items[0].qty_break === true && s.items[0].orig_unit_price_vnd === 100000 && s.items[0].qty_break_next?.more === 7
    ? ok('giỏ 3 cái: 270k, gắn nhãn giá mua nhiều, nhắc thêm 7 cái tới bậc 10') : bad('giỏ 3 cái sai', JSON.stringify(s.items?.[0]));

  sect('8. VÒNG TRUNG THỰC: shop đổi bậc giữa lúc khách điền form → 409 dựng lại, không đẻ đơn');
  cart = await fillCart([[A.v[0], 3]]);
  await hreq('POST', '/checkout', { json: { customer: { name: 'K', phone: '0900000099' }, address: { line: 'x', province: 'Hà Nội' }, payment_method: 'cod' }, cartCookie: cart });
  let page = await hreq('GET', '/checkout', { cartCookie: cart, accept: 'text/html' });
  const grab = (b) => ({ idem: b.match(/name="idempotency_key" value="([^"]+)"/)?.[1], ct: b.match(/name="ct" value="([^"]+)"/)?.[1], sub: b.match(/name="subtotal_seen" value="([^"]+)"/)?.[1] });
  let f = grab(page.body);
  f.sub === '270000' ? ok('subtotal_seen = 270000 (đã áp bậc)') : bad('subtotal_seen sai', f.sub);
  await putQb(A.id, []);   // shop bỏ hết bậc
  await sleep(2600);
  r = await hreq('POST', '/checkout/place', { form: { idempotency_key: f.idem, ct: f.ct, subtotal_seen: f.sub, name: 'Khách', phone: '0900000099', address_line: '1 Lê Lợi', province: 'Hà Nội', payment_method: 'cod' }, cartCookie: cart, accept: 'text/html' });
  const nO = N((await owner.query(`SELECT count(*)::int n FROM orders WHERE shop_id=$1 AND customer_phone='0900000099'`, [shopId])).rows[0].n);
  r.status === 200 && !r.location && grab(r.body).sub === '300000' && nO === 0
    ? ok('bậc bị bỏ → không đặt, form dựng lại với 300k, 0 đơn') : bad('đổi bậc giữa chừng lọt', `st=${r.status} sub=${grab(r.body).sub} n=${nO}`);

  sect('9. Trang sản phẩm in bảng bậc + luật gộp size');
  await putQb(A.id, [{ min_qty: 3, price_vnd: 90000 }, { min_qty: 10, price_vnd: 80000 }]);
  let pg1 = await storeGet(`/p/${A.slug}`);
  pg1.status === 200 && /Mua từ 3 cái/.test(pg1.body) && /Mua từ 10 cái/.test(pg1.body) && /Cộng chung mọi size, màu/.test(pg1.body)
    ? ok('PDP: hai bậc + câu "cộng chung mọi size, màu"') : bad('PDP thiếu bảng bậc', pg1.status);
  pr = await mkPromo(shopId, 'percent', 50);
  pg1 = await storeGet(`/p/${A.slug}`);
  !/Mua từ 3 cái/.test(pg1.body) ? ok('flash sale rẻ hơn mọi bậc → PDP KHÔNG hứa bậc không bao giờ áp') : bad('PDP hứa bậc đắt hơn giá sale');
  await offPromo(pr);
  await putQb(A.id, []);
  pg1 = await storeGet(`/p/${A.slug}`);
  !/class="qb"/.test(pg1.body) ? ok('không có bậc → không có khối') : bad('khối bậc hiện khi không có bậc');

  sect('10. Cô lập shop: bậc của shop này không đọc được từ shop khác');
  const slug2 = `qb2-${uniq()}`;
  r = await rq(PLATFORM, 'POST', '/ops/shops', { body: { name: slug2, slug: slug2, plan_code: 'platform' }, cookie: staff, origin: OO });
  const oe2 = `owner-${uniq()}@shop.vn`;
  await rq(PLATFORM, 'POST', `/ops/shops/${r.json.id}/invitations`, { body: { email: oe2, role: 'owner' }, cookie: staff, origin: OO });
  await rq(AUTH, 'POST', '/auth/invitations/accept', { body: { token: await inviteTokenOf(oe2), password: op }, origin: OA });
  const oc2 = await login(oe2, op);
  r = await rq(SELLER, 'PUT', `/shops/${r.json.id}/products/${B.id}/qty-breaks`, { body: { qty_breaks: [{ min_qty: 2, price_vnd: 1000 }] }, cookie: oc2, origin: OS });
  const bq = await owner.query(`SELECT min_qty, price_vnd FROM product_qty_breaks WHERE product_id=$1`, [B.id]);
  r.status === 404 && bq.rows.length === 1 && N(bq.rows[0].price_vnd) === 90000 ? ok('shop khác PUT bậc lên SP không phải của mình → 404, bậc gốc nguyên vẹn') : bad('rò chéo shop', `${r.status} ${JSON.stringify(bq.rows)}`);

  console.log(`\n${pass} pass, ${fail} fail`);
  await owner.end();
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
