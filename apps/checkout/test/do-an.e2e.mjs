// E2E — Shop đồ ăn, đợt 1 (0187): LỜI DẶN của khách · TIN TELEGRAM có món · GIỜ NHẬN ĐƠN / TẠM NGHỈ.
//
// Chạy trong dbtest:
//   docker compose -f infra/compose.dev.yml exec -T dbtest node apps/checkout/test/do-an.e2e.mjs
//
// Mọi khẳng định đặt ở BỀ MẶT người dùng nhìn thấy (§4): trang thanh toán khách thấy, dải báo
// trên cửa hàng, trang cài đặt + chi tiết đơn + phiếu in của người bán, và chính TIN TELEGRAM mà
// stub nhận được. Đếm bằng SQL chỉ dùng để chứng minh "KHÔNG có gì được ghi" — thứ không có bề
// mặt nào để nhìn.
//
// Giờ nhận đơn được đặt TƯƠNG ĐỐI với giờ Việt Nam lúc chạy (đọc từ DB), nên bộ này xanh ở mọi
// giờ trong ngày — kể cả khi khung "đang mở" phải vắt qua nửa đêm.
//
// Bộ này mở stub Telegram ở dbtest:9104 (cổng worker trỏ tới). Đừng chạy song song với
// apps/worker/test/e2e.mjs — hai bộ cùng giành một cổng.
import http from 'node:http';
import pg from 'pg';
import { totp, counterFor } from '../../../packages/auth/src/totp.js';
import { base32Decode } from '../../../packages/auth/src/base32.js';

const AUTH = 'http://auth:3020', PLATFORM = 'http://platform:3030', SELLER = 'http://seller:3040';
const ADMIN = process.env.ADMIN_URL ?? 'http://seller-admin:3001';
const WORKER = process.env.WORKER_URL ?? 'http://worker:3080';
const CO = new URL(process.env.CHECKOUT_URL ?? 'http://checkout:3060');
const STORE = new URL(process.env.STOREFRONT_URL ?? 'http://storefront:3050');
const OA = 'https://auth.localtest', OO = 'https://ops.localtest', OS = 'https://seller.localtest';
const OADM = process.env.ADMIN_ORIGIN ?? 'https://admin.localtest';
const owner = new pg.Pool({ connectionString: process.env.DATABASE_URL_OWNER, max: 3 });

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  PASS ' + m); };
const bad = (m, d) => { fail++; console.log('  FAIL ' + m + (d ? ' :: ' + String(d).slice(0, 400) : '')); };
const check = (cond, m, d) => (cond ? ok(m) : bad(m, typeof d === 'function' ? d() : d));
const sect = (m) => console.log('\n# ' + m);
const uniq = () => Math.random().toString(36).slice(2, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ck = (sc) => { for (const c of sc ?? []) { const m = /^__Host-session=([^;]*)/.exec(c); if (m) return m[1]; } return null; };
const q1 = async (sql, args) => (await owner.query(sql, args)).rows[0];

async function rq(base, method, path, { body, cookie, origin } = {}) {
  const h = {}; if (body !== undefined) h['content-type'] = 'application/json';
  if (origin) h.origin = origin; if (cookie) h.cookie = `__Host-session=${cookie}`;
  const r = await fetch(base + path, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch {}
  return { status: r.status, json: j, sc: r.headers.getSetCookie(), raw: t };
}
// BFF quản trị: form urlencoded, KHÔNG theo redirect.
async function adm(method, path, { cookie, form } = {}) {
  const headers = { origin: OADM };
  if (form !== undefined) headers['content-type'] = 'application/x-www-form-urlencoded';
  if (cookie) headers.cookie = `__Host-session=${cookie}`;
  const r = await fetch(ADMIN + path, { method, headers, redirect: 'manual', body: form === undefined ? undefined : new URLSearchParams(form).toString() });
  return { status: r.status, location: r.headers.get('location'), body: await r.text() };
}
const inviteTokenOf = async (email) => { const r = await q1(`SELECT payload->>'accept_url' AS u FROM outbox WHERE topic='user.invited' AND payload->>'to'=$1 ORDER BY id DESC LIMIT 1`, [email]); return r?.u ? new URL(r.u).searchParams.get('token') : null; };
const login = async (e, p) => ck((await rq(AUTH, 'POST', '/auth/login', { body: { email: e, password: p }, origin: OA })).sc);
const uidOf = async (e) => (await q1('SELECT id FROM users WHERE email=$1', [e]))?.id ?? null;

// node:http với Host của shop (fetch của Node CẤM đặt Host — §4).
function hostReq(target, host, method, path, { json, form, cartTok, idem } = {}) {
  return new Promise((resolve, reject) => {
    const data = json !== undefined ? JSON.stringify(json) : form !== undefined ? new URLSearchParams(form).toString() : null;
    const headers = { host, origin: `https://${host}` };
    if (json !== undefined) headers['content-type'] = 'application/json';
    else if (form !== undefined) headers['content-type'] = 'application/x-www-form-urlencoded';
    if (data != null) headers['content-length'] = Buffer.byteLength(data);
    if (idem) headers['idempotency-key'] = idem;
    if (cartTok) headers.cookie = `__Host-cart=${cartTok}`;
    const req = http.request({ hostname: target.hostname, port: target.port, path, method, headers }, (rs) => {
      let b = ''; rs.on('data', (d) => (b += d)); rs.on('end', () => {
        let j = null; try { j = b ? JSON.parse(b) : null; } catch {}
        let tok = cartTok; for (const c of rs.headers['set-cookie'] ?? []) { const m = /^__Host-cart=([^;]*)/.exec(c); if (m) tok = m[1]; }
        resolve({ status: rs.statusCode, json: j, body: b, cartTok: tok, location: rs.headers.location, headers: rs.headers });
      });
    });
    req.on('error', reject); if (data != null) req.write(data); req.end();
  });
}
const co = (host, ...a) => hostReq(CO, host, ...a);
const store = (host, path) => hostReq(STORE, host, 'GET', path);

async function makeStaff() {
  const email = `staff-doan-${uniq()}@nentang.vn`, password = 'staff strong passphrase';
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
async function invite(staff, shopId, role) {
  const email = `${role.replace('_', '-')}-${uniq()}@shop.vn`, password = `${role} passphrase strong`;
  const inv = await rq(PLATFORM, 'POST', `/ops/shops/${shopId}/invitations`, { body: { email, role }, cookie: staff, origin: OO });
  if (inv.status !== 201) throw new Error(`không mời được ${role}: ${inv.status} ${inv.raw}`);
  const acc = await rq(AUTH, 'POST', '/auth/invitations/accept', { body: { token: await inviteTokenOf(email), password }, origin: OA });
  if (acc.status !== 200) throw new Error(`không nhận được lời mời ${role}: ${acc.status} ${acc.raw}`);
  return login(email, password);
}
async function makeShop(staff) {
  const slug = `doan-${uniq()}`;
  const created = await rq(PLATFORM, 'POST', '/ops/shops', { body: { name: 'Quán Thử Nghiệm', slug, plan_code: 'platform' }, cookie: staff, origin: OO });
  if (created.status !== 201) throw new Error(`không tạo được shop: ${created.status} ${created.raw}`);
  const shopId = created.json.id;
  await owner.query(`UPDATE shops SET status='active', went_live_at=now() WHERE id=$1`, [shopId]);
  return { shopId, host: `${slug}.nentang.vn`, oc: await invite(staff, shopId, 'owner') };
}
const hidden = (html, name) => new RegExp(`name="${name}" value="([^"]*)"`).exec(html)?.[1] ?? '';
// Cắt ĐÚNG khối trước khi khớp (§4: khẳng định trên toàn văn bản là xanh/đỏ giả).
const cut = (html, re) => re.exec(html)?.[0] ?? '';
const KHOI_GIO = /<div class="card" id="gio-nhan-don">[\s\S]*?<\/form>/;
const KHOI_DONG = /<div class="closedbar"[^>]*>[\s\S]*?<\/div>/;
const KHOI_DAN = /<div class="card khach-dan"[\s\S]*?<\/div>/;
// jsonb không giữ thứ tự khoá ⇒ so theo NỘI DUNG, không so chuỗi JSON.
const mons = (items) => JSON.stringify((items ?? []).map((i) => [i.title, i.qty]));
const fmt = (h) => `${String(((h % 24) + 24) % 24).padStart(2, '0')}:00`;
async function waitValue(fn, timeout = 12000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { const v = await fn(); if (v) return v; await sleep(250); }
  return null;
}

async function main() {
  const staff = await makeStaff();
  const A = await makeShop(staff);
  const omc = await invite(staff, A.shopId, 'order_manager');
  const base = `/shops/${A.shopId}`;
  const mon = `Cơm gà xối mỡ ${uniq()}`;
  const p = await rq(SELLER, 'POST', `${base}/products`, { body: { title: mon, slug: `sp-${uniq()}`, price_vnd: 45000, status: 'active', variants: [{ sku: `CG-${uniq()}`, price_vnd: 45000 }] }, cookie: A.oc, origin: OS });
  const vid = (await rq(SELLER, 'GET', `${base}/products/${p.json.id}`, { cookie: A.oc })).json.variants[0].id;
  await rq(SELLER, 'POST', `${base}/variants/${vid}/inventory/adjust`, { body: { delta: 100, reason: 'seed' }, cookie: A.oc, origin: OS });
  const newCart = async (qty = 1) => (await co(A.host, 'POST', '/cart/items', { json: { variant_id: vid, qty } })).cartTok;
  const nOrders = async () => Number((await q1(`SELECT count(*)::int n FROM orders WHERE shop_id=$1`, [A.shopId])).n);
  const reserved = async () => Number((await q1(`SELECT reserved FROM inventory_levels WHERE variant_id=$1`, [vid])).reserved);
  const shopRow = () => q1(`SELECT orders_paused, orders_pause_note, to_char(order_open_time,'HH24:MI') o, to_char(order_close_time,'HH24:MI') c FROM shops WHERE id=$1`, [A.shopId]);
  const saveHours = (form, cookie = A.oc) => adm('POST', `${base}/settings/hours`, { cookie, form: { orders_paused: '', orders_pause_note: '', order_open_time: '', order_close_time: '', ...form } });
  const kh = { customer: { name: 'Khách Thử', phone: '0912345678' }, address: { line: '1 Đường Thử', province: 'Hà Nội' }, payment_method: 'cod' };
  // Giờ Việt Nam lúc chạy — đọc từ DB, cùng nguồn với hàm quyết định.
  const H = Number((await q1(`SELECT extract(hour FROM now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::int h`)).h);
  ok(`dựng shop + chủ + nhân viên đơn hàng; giờ VN lúc chạy ≈ ${fmt(H)}`);

  sect('1. Mặc định (shop cũ, chưa cài giờ): nhận đơn cả ngày, có ô lời dặn');
  let cart = await newCart();
  let g = await co(A.host, 'GET', '/checkout', { cartTok: cart });
  check(g.status === 200 && /name="customer_note"/.test(g.body) && /maxlength="300"/.test(cut(g.body, /<textarea id="f-note"[^>]*>/)),
    'trang thanh toán có ô "Lời dặn cho cửa hàng" (300 ký tự)', () => g.body.slice(0, 200));
  check(/Đặt hàng · /.test(g.body) && !/co-closed/.test(g.body), 'shop chưa cài giờ: nút Đặt hàng mở, không có thẻ báo đóng');
  let sf = await store(A.host, '/');
  check(sf.status === 200 && !/class="closedbar"/.test(sf.body), 'cửa hàng: KHÔNG có dải "chưa nhận đơn" khi đang nhận đơn', () => `${sf.status}`);
  let st = await adm('GET', `${base}/settings`, { cookie: A.oc });
  check(/✅ Đang nhận đơn/.test(cut(st.body, KHOI_GIO)), 'trang Cài đặt: thẻ "Giờ nhận đơn" nói "Đang nhận đơn"', () => cut(st.body, KHOI_GIO).slice(0, 300));

  sect('2. Kiểm tra dữ liệu giờ nhận đơn (ô sai được đánh dấu, DB giữ nguyên)');
  let before = await shopRow();
  let r = await saveHours({ order_open_time: '10:00' });
  let khoi = cut(r.body, KHOI_GIO);
  check(/Cần nhập cả giờ bắt đầu và giờ ngừng nhận đơn/.test(r.body) && /name="order_close_time" aria-invalid="true" autofocus/.test(khoi),
    'chỉ nhập giờ bắt đầu → báo thiếu + đánh dấu ĐÚNG ô giờ ngừng', () => khoi.slice(0, 600));
  check(/name="order_open_time"[^>]*value="10:00"/.test(khoi), 'dựng lại form giữ giờ vừa gõ');
  r = await saveHours({ order_open_time: '10:00', order_close_time: '10:00' });
  check(/không được trùng nhau/.test(r.body), 'giờ bắt đầu = giờ ngừng → báo trùng');
  r = await saveHours({ order_open_time: '25:00', order_close_time: '10:00' });
  check(/name="order_open_time" aria-invalid="true"/.test(cut(r.body, KHOI_GIO)), 'giờ sai định dạng (25:00) → đánh dấu ô giờ bắt đầu');
  const sauLoi = await shopRow();
  check(JSON.stringify(sauLoi) === JSON.stringify(before), 'ba lần lưu sai KHÔNG ghi gì vào DB', JSON.stringify(sauLoi));

  sect('3. Nhân viên đơn hàng KHÔNG đổi được giờ nhận đơn');
  r = await rq(SELLER, 'PATCH', `${base}/settings/hours`, { body: { orders_paused: true }, cookie: omc, origin: OS });
  check(r.status === 403, 'order_manager PATCH settings/hours → 403', () => `${r.status} ${r.raw}`);
  check((await shopRow()).orders_paused === false, 'shop KHÔNG bị tạm nghỉ bởi vai không có quyền');

  sect('4. Đặt hàng TRƯỚC giờ đóng, rồi đóng cửa → gửi lại cùng khoá vẫn nhận lại ĐÚNG đơn cũ');
  const kRe = `re-${uniq()}`;
  cart = await newCart();
  const first = await co(A.host, 'POST', '/checkout', { json: kh, cartTok: cart, idem: kRe });
  check(first.status === 201 && first.json?.order_number, 'đơn đặt lúc còn mở → 201', () => `${first.status} ${first.body}`);

  // Khung [H+2, H+3) không bao giờ chứa giờ hiện tại → ĐANG NGOÀI GIỜ, ở mọi giờ chạy test.
  const ngoaiMo = fmt(H + 2), ngoaiDong = fmt(H + 3);
  r = await saveHours({ order_open_time: ngoaiMo, order_close_time: ngoaiDong });
  check(r.status === 200 && /Đã lưu giờ nhận đơn\./.test(r.body), 'lưu khung giờ qua trang Cài đặt → "Đã lưu giờ nhận đơn."', () => `${r.status}`);
  const sau = await shopRow();
  check(sau.o === ngoaiMo && sau.c === ngoaiDong && sau.orders_paused === false, `DB ghi đúng khung ${ngoaiMo}–${ngoaiDong}`, JSON.stringify(sau));
  check(new RegExp(`🌙 Ngoài giờ nhận đơn — khách đặt lại được từ ${ngoaiMo}`).test(cut(r.body, KHOI_GIO)),
    'trang Cài đặt nói "Ngoài giờ nhận đơn" + giờ mở lại', () => cut(r.body, KHOI_GIO).slice(0, 400));

  const nTruoc = await nOrders();
  const replay = await co(A.host, 'POST', '/checkout', { json: kh, cartTok: cart, idem: kRe });
  check(replay.status === 201 && replay.json?.order_number === first.json.order_number && replay.headers['idempotency-replayed'] === 'true',
    'NGOÀI GIỜ, gửi lại cùng khoá → trả lại ĐÚNG đơn cũ (không phải câu "quán đã đóng")', () => `${replay.status} ${replay.body}`);
  check(await nOrders() === nTruoc, 'gửi lại không tạo thêm đơn');

  sect('5. NGOÀI GIỜ: khách thấy trước, bấm cũng không lọt, giỏ + chữ đã gõ còn nguyên');
  sf = await store(A.host, '/');
  const dai = cut(sf.body, KHOI_DONG);
  check(new RegExp(`Ngoài giờ nhận đơn — cửa hàng nhận đơn từ ${ngoaiMo} đến ${ngoaiDong} mỗi ngày`).test(dai),
    'cửa hàng: dải báo "Ngoài giờ nhận đơn" kèm khung giờ, ngay trên đầu trang', () => dai || sf.body.slice(0, 300));
  cart = await newCart(2);
  check(!!cart, 'ngoài giờ vẫn bỏ món vào giỏ được');
  g = await co(A.host, 'GET', '/checkout', { cartTok: cart });
  const theDong = cut(g.body, /<div class="card co-closed"[\s\S]*?<\/div>/);
  check(/Hiện đang ngoài giờ nhận đơn/.test(theDong) && /giỏ hàng vẫn được giữ/.test(theDong), 'trang thanh toán: thẻ báo đóng nói lý do + giỏ còn giữ', () => theDong || g.body.slice(0, 300));
  check(/<button class="btn" type="submit" disabled aria-disabled="true">Cửa hàng chưa nhận đơn lúc này<\/button>/.test(g.body) && !/Đặt hàng · /.test(g.body),
    'nút Đặt hàng bị khoá (không mời bấm một nút chắc chắn bị từ chối)');

  const rsvTruoc = await reserved(), nTruoc2 = await nOrders();
  await sleep(2600); // như người thật (bẫy thời gian chống bot)
  const loiDanDong = 'Giao cổng sau giúp em';
  const placed = await co(A.host, 'POST', '/checkout/place', { cartTok: cart, form: {
    idempotency_key: hidden(g.body, 'idempotency_key'), ct: hidden(g.body, 'ct'),
    subtotal_seen: hidden(g.body, 'subtotal_seen'), ship_seen: hidden(g.body, 'ship_seen'),
    name: 'Khách Thử', phone: '0912345678', address_line: '1 Đường Thử', province: 'Hà Nội', payment_method: 'cod',
    customer_note: loiDanDong,
  } });
  check(placed.status === 409 && /Hiện đang ngoài giờ nhận đơn/.test(placed.body), 'form không-JS gửi lúc đóng → 409 + dựng lại form có lý do', () => `${placed.status} ${placed.body.slice(0, 200)}`);
  check(/value="Khách Thử"/.test(placed.body) && new RegExp(`>${loiDanDong}</textarea>`).test(placed.body),
    'form dựng lại GIỮ tên + lời dặn đã gõ', () => cut(placed.body, /<textarea id="f-note"[\s\S]*?<\/textarea>/));
  check((placed.body.match(/Hiện đang ngoài giờ nhận đơn/g) ?? []).length === 1, 'câu báo đóng chỉ in MỘT lần (không lặp thẻ lỗi)');
  const nSau2 = await nOrders(), rsvSau = await reserved();
  check(nSau2 === nTruoc2 && rsvSau === rsvTruoc, 'KHÔNG tạo đơn, KHÔNG giữ chỗ tồn', `orders ${nTruoc2}→${nSau2} reserved ${rsvTruoc}→${rsvSau}`);

  const kDong = `dong-${uniq()}`;
  const j = await co(A.host, 'POST', '/checkout', { json: kh, cartTok: cart, idem: kDong });
  check(j.status === 409 && j.json?.shop_closed === true && /ngoài giờ nhận đơn/.test(j.json?.error ?? ''), 'API JSON lúc đóng → 409 shop_closed', () => `${j.status} ${j.body}`);
  check(!(await q1(`SELECT 1 x FROM idempotency_keys WHERE shop_id=$1 AND key=$2`, [A.shopId, kDong])), 'khoá idempotency KHÔNG bị giữ lại sau khi bị từ chối');

  sect('6. TẠM NGHỈ có lời nhắn (đè lên giờ), lời nhắn được thoát HTML');
  r = await saveHours({ orders_paused: 'on', orders_pause_note: 'Nghỉ Tết tới mùng 6 <b>x</b>' });
  check(/Đã bật TẠM NGHỈ — khách không đặt được đơn mới/.test(r.body) && /Đang tạm nghỉ — khách không đặt được đơn mới/.test(cut(r.body, KHOI_GIO)),
    'bật tạm nghỉ → câu báo nói rõ trạng thái MỚI', () => r.body.slice(0, 200));
  check((await shopRow()).orders_paused === true, 'DB: orders_paused = true');
  const aud = await q1(`SELECT metadata FROM audit_logs WHERE shop_id=$1 AND action='shop.settings_hours_updated' ORDER BY created_at DESC LIMIT 1`, [A.shopId]);
  check(aud?.metadata?.orders_paused === true, 'nhật ký ghi lại lần bật tạm nghỉ (trả lời được "sao tối qua không đặt được")', JSON.stringify(aud));
  sf = await store(A.host, '/');
  const daiNghi = cut(sf.body, KHOI_DONG);
  check(/Cửa hàng đang tạm nghỉ, chưa nhận đơn mới\. Nghỉ Tết tới mùng 6 &lt;b&gt;x&lt;\/b&gt;/.test(daiNghi) && !/<b>x<\/b>/.test(daiNghi),
    'cửa hàng: dải "tạm nghỉ" + lời nhắn (đã thoát HTML)', () => daiNghi);
  const jn = await co(A.host, 'POST', '/checkout', { json: kh, cartTok: cart, idem: `nghi-${uniq()}` });
  check(jn.status === 409 && /tạm nghỉ/.test(jn.json?.error ?? '') && /Nghỉ Tết tới mùng 6/.test(jn.json?.error ?? '') && !/\d\d:\d\d/.test(jn.json?.error ?? ''),
    'đặt hàng lúc tạm nghỉ → 409 nói "tạm nghỉ" + lời nhắn, KHÔNG hứa giờ mở', () => jn.body);

  sect('7. Mở lại trong khung giờ đang mở (vắt qua nửa đêm nếu cần) → đặt được, lời dặn tới tận bếp');
  // Bind Telegram cho shop qua stub, để đo CHÍNH tin chủ shop nhận được.
  const tg = { updates: [], sent: [] };
  const tgStub = http.createServer((a, b) => {
    let s = ''; a.on('data', (d) => (s += d)); a.on('end', () => {
      b.setHeader('content-type', 'application/json');
      if (/\/getUpdates/.test(a.url)) return b.end(JSON.stringify({ ok: true, result: tg.updates.splice(0) }));
      if (/\/sendMessage/.test(a.url)) { try { tg.sent.push(JSON.parse(s)); } catch {} return b.end(JSON.stringify({ ok: true, result: {} })); }
      b.statusCode = 404; b.end('{}');
    });
  });
  await new Promise((res) => tgStub.listen(9104, '0.0.0.0', res));
  const link = await rq(SELLER, 'POST', `${base}/telegram/link`, { cookie: A.oc, origin: OS });
  const code = /start=([^&\s]+)/.exec(link.json?.deep_link ?? '')?.[1];
  const CHAT = String(900_000_000_000 + Math.floor(Math.random() * 99_999_999_999));
  tg.updates.push({ update_id: 1, message: { chat: { id: Number(CHAT) }, text: `/start ${code}` } });
  await fetch(`${WORKER}/internal/telegram-link-sweep`, { method: 'POST' });
  const bound = await waitValue(async () => (await q1(`SELECT chat_id FROM shop_telegram WHERE shop_id=$1`, [A.shopId]))?.chat_id === CHAT);
  check(!!bound, 'shop đã kết nối Telegram (stub)');

  // Khung [H-1, H+2) LUÔN chứa giờ hiện tại; H=0 thì thành 23:00 → 02:00 (qua nửa đêm).
  const moMo = fmt(H - 1), moDong = fmt(H + 2);
  r = await saveHours({ order_open_time: moMo, order_close_time: moDong });
  check(/Đã lưu giờ nhận đơn\./.test(r.body) && /✅ Đang nhận đơn/.test(cut(r.body, KHOI_GIO)) && (await shopRow()).orders_paused === false,
    `bỏ tích tạm nghỉ + khung ${moMo}–${moDong} → "Đang nhận đơn"`, () => cut(r.body, KHOI_GIO).slice(0, 300));
  sf = await store(A.host, '/');
  check(!/class="closedbar"/.test(sf.body), 'cửa hàng: dải "chưa nhận đơn" biến mất');

  // Khoá bị từ chối lúc đóng (mục 5) dùng lại được ngay khi mở — khách bấm lại là xong.
  cart = await newCart(2);
  const lai = await co(A.host, 'POST', '/checkout', { json: kh, cartTok: cart, idem: kDong });
  check(lai.status === 201, 'khoá từng bị từ chối lúc đóng → mở lại gửi lại được, tạo đơn bình thường', () => `${lai.status} ${lai.body}`);

  cart = await newCart(2);
  g = await co(A.host, 'GET', '/checkout', { cartTok: cart });
  check(/Đặt hàng · /.test(g.body) && !/co-closed/.test(g.body), 'trong giờ: nút Đặt hàng mở lại');
  tg.sent.length = 0;
  await sleep(2600);
  const loiDan = 'ít cay\r\nkhông hành <b>x</b>';
  const ord = await co(A.host, 'POST', '/checkout/place', { cartTok: cart, form: {
    idempotency_key: hidden(g.body, 'idempotency_key'), ct: hidden(g.body, 'ct'),
    subtotal_seen: hidden(g.body, 'subtotal_seen'), ship_seen: hidden(g.body, 'ship_seen'),
    name: 'Khách Thử', phone: '0912345678', address_line: '1 Đường Thử', province: 'Hà Nội', payment_method: 'cod',
    customer_note: loiDan,
  } });
  const num = Number(/number=(\d+)/.exec(ord.location ?? '')?.[1]);
  check(ord.status === 303 || ord.status === 302 ? !!num : false, 'đặt hàng bằng form có lời dặn → chuyển sang trang xác nhận', () => `${ord.status} ${ord.location} ${ord.body.slice(0, 200)}`);
  const o = await q1(`SELECT id, customer_note FROM orders WHERE shop_id=$1 AND order_number=$2`, [A.shopId, num]);
  check(o?.customer_note === 'ít cay\nkhông hành <b>x</b>', 'DB lưu lời dặn nguyên văn (CRLF → LF, không gộp dòng)', JSON.stringify(o));

  const ob = await q1(`SELECT payload FROM outbox WHERE shop_id=$1 AND topic='order.created' AND payload->>'order_id'=$2`, [A.shopId, o?.id]);
  check(mons(ob?.payload?.items) === mons([{ title: mon, qty: 2 }]) && ob?.payload?.customer_note === o?.customer_note,
    'outbox đơn mới mang món (tên + số lượng) + lời dặn', JSON.stringify(ob?.payload));
  check(!!ob && (ob.payload.items ?? []).every((i) => Object.keys(i).sort().join() === 'qty,title'), 'món trong outbox CHỈ có tên + số lượng (không giá/SKU/variant)', JSON.stringify(ob?.payload?.items));

  const tin = await waitValue(() => tg.sent.find((m) => String(m.chat_id) === CHAT && (m.text ?? '').includes(`#${num}`)));
  check(!!tin && tin.text.includes(`• 2 × ${mon}`) && tin.text.includes('📝 Khách dặn: ít cay\nkhông hành <b>x</b>'),
    'TIN TELEGRAM chủ shop nhận: có "• 2 × <món>" + "📝 Khách dặn"', () => JSON.stringify(tin ?? tg.sent));

  const ct = await adm('GET', `${base}/orders/${o?.id}`, { cookie: A.oc });
  const dan = cut(ct.body, KHOI_DAN);
  check(/📝 Khách dặn/.test(dan) && /ít cay\nkhông hành &lt;b&gt;x&lt;\/b&gt;/.test(dan) && !/<b>x<\/b>/.test(dan),
    'chi tiết đơn (quản trị): thẻ "📝 Khách dặn", giữ xuống dòng, đã thoát HTML', () => dan || ct.body.slice(0, 200));
  const iDan = ct.body.indexOf('khach-dan'), iSp = ct.body.indexOf('<h2>Sản phẩm');
  check(iDan > 0 && iSp > 0 && iDan < iSp, 'thẻ lời dặn đứng TRƯỚC danh sách sản phẩm (người soạn hàng thấy trước)', `${iDan} / ${iSp}`);
  const pr = await adm('GET', `${base}/orders/${o?.id}/print`, { cookie: A.oc });
  check(pr.status === 200 && /<b>Khách dặn:<\/b> ít cay\nkhông hành &lt;b&gt;x&lt;\/b&gt;/.test(pr.body), 'phiếu in có "Khách dặn:"', () => `${pr.status}`);

  sect('8. Đơn tạo tay (seller) cũng mang món vào tin đơn mới');
  const man = await rq(SELLER, 'POST', `${base}/orders`, { body: { idempotency_key: `man-${uniq()}`, lines: [{ variant_id: vid, qty: 3 }], customer: { name: 'Khách Tay', phone: '0911000333' }, payment_method: 'cod' }, cookie: A.oc, origin: OS });
  const mp = man.json?.id ? await q1(`SELECT payload FROM outbox WHERE shop_id=$1 AND topic='order.created' AND payload->>'order_id'=$2`, [A.shopId, man.json.id]) : null;
  check(man.status === 201 && mons(mp?.payload?.items) === mons([{ title: mon, qty: 3 }]), 'đơn tạo tay: outbox có món', () => `${man.status} ${JSON.stringify(mp?.payload ?? man.json)}`);

  tgStub.close();
  console.log(`\n${pass} pass, ${fail} fail`);
  await owner.end();
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
