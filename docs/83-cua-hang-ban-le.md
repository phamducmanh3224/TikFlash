# 83 — Cửa hàng bán lẻ kiểu sàn: hàng lên màn đầu · nhãn thật · không hứa thay shop · giỏ −/+

Ngày 31/10/2026. Nhánh `claude/project-thread-ba2ia3` (cùng PR với `docs/82`). Không đụng tiền,
giá, phí ship, tồn hay quyền — chỉ đổi cách trình bày và chữ mẫu.

## Vì sao có đợt này

Chủ dự án định hướng TikFlash phục vụ **hai loại shop**: bán lẻ online và quán ăn giao đi; shop
chọn ngành lúc đăng ký. Với bán lẻ, chủ dự án gửi một cửa hàng thời trang làm mẫu **bố cục**
(chỉ học cách bố trí, không chép thương hiệu) và chọn làm bán lẻ trước, quán ăn sau.

Đi thử như khách trên 5 mẫu giao diện, ở 390×844 và 1366×800, đo ra bốn chỗ:

| chỗ | đo trước khi sửa |
|---|---|
| điện thoại, trang chủ: thẻ sản phẩm đầu tiên ở | y = 1146–1201 (màn cao 844) — khách phải vuốt hơn một màn mới thấy hàng |
| điện thoại, `/products`: thẻ đầu tiên ở | y = 1021–1042 — bộ lọc `<details open>` mở sẵn chiếm cả màn đầu |
| chữ mẫu | thanh trên đầu, khối cam kết, menu của 4/5 mẫu hứa thay shop: "Giao nhanh 2 giờ", "Đổi trả trong 24h", "đạt chuẩn VietGAP", "Giao hàng toàn quốc", "Bảo hành"…, cùng mục menu trỏ tới trang không có |
| giỏ + thanh toán | đầu trang khác cửa hàng (tên shop chữ gradient), ở 390px tên shop, "Tra cứu đơn", "Giỏ hàng" đều gãy hai dòng; đổi số lượng phải gõ số rồi bấm "Cập nhật"; thành tiền lấn sát mép thẻ |

## Đã làm

### 1. Không câu hứa nào nói thay shop

Đổi trả, bảo hành, freeship, giao trong N giờ, chính hãng, VietGAP… là **chính sách riêng của
từng shop**. Nền tảng in sẵn thì shop không làm được vẫn bị khách bắt bẻ, và shop thường không
biết câu đó đang nằm trên trang mình.

- `packages/presets`: bỏ mọi `topbar_text`, bỏ `features.items` (khối cam kết dùng mặc định của
  nền tảng), bỏ menu giả của 4 mẫu (giữ "Tất cả sản phẩm / Hàng mới / Khuyến mãi" của mẫu
  Chung — ba trang đó có thật). Câu hero viết lại cho không hứa gì.
- `DEFAULT_FEATURES` (storefront) và `THEME_FEATURE_DEFAULTS` (trang Giao diện của admin) đổi
  sang **bốn điều nền tảng bảo đảm được**: trả tiền khi nhận hàng (COD luôn bật — checkout không
  có cờ tắt COD), biết phí giao trước khi đặt, không cần tạo tài khoản, tra cứu đơn bằng mã.
  Hai bảng này phải giống nhau từng chữ; chốt so BẰNG.
- Khối cam kết, dải tin cậy ở trang sản phẩm và huy hiệu chân trang đọc **cùng một nguồn**
  (`shopFeatures`): shop sửa cam kết thì cả ba chỗ nói đúng câu của shop.
- Thanh thông báo trên đầu chỉ hiện khi shop **tự viết**.

**Shop đang chạy giữ nguyên** giao diện đã lưu (kể cả câu hứa cũ họ đang có) cho tới khi bấm
"Áp mẫu" — đổi im lặng chữ trên cửa hàng của người khác là việc không được làm.

### 2. Hàng lên màn đầu

- Trang chủ, hero tự dựng (shop chưa có ảnh banner): điện thoại ẩn khung minh hoạ, câu dẫn tối đa
  2 dòng, mũi tên ẩn khi có JS (vuốt được); máy tính hero thấp lại. Nút "Bộ sưu tập" chỉ hiện khi
  trang chủ thật sự có khối `#bo-suu-tap` — trước đây mọi mẫu ngành đều có nút bấm không đi đâu.
- Khối cam kết ở điện thoại thành lưới 2×2 chỉ tiêu đề.
- `/products` ở điện thoại: ô tìm, hàng chip danh mục (và danh mục con) cuộn ngang, nút
  "Lọc · N" **đóng** kể cả khi đang lọc (N = số điều kiện đang áp), sắp xếp cuộn ngang. Cột bên
  trái chỉ ở máy tính. Thứ tự trong DOM = thứ tự nhìn (không dùng CSS `order`).

### 3. Thẻ sản phẩm có nhãn thật

- Góc ảnh: "-N%" (giảm thật so với giá gạch hoặc giá sale) và "Bán chạy" khi `sold_count` thật
  ≥ 50. Hết hàng thì chỉ một nhãn "Hết hàng". Không có dữ liệu thì không có nhãn.
- Ô % rời khỏi dòng giá: thẻ điện thoại rộng ~145px, giá + gạch + % trên một dòng là xuống
  dòng, các thẻ trong một hàng cao thấp lệch nhau.
- Nút "Thêm vào giỏ" không gãy dòng; giá không còn `margin-top:auto` (giá trong một hàng thẳng nhau).

### 4. Giỏ + thanh toán đi cùng giọng với cửa hàng

- Đầu trang: tên shop chữ đặc màu mực, một dòng (dài thì cắt bằng …); hai lối tắt có biểu tượng,
  ở màn ≤560px xếp biểu tượng trên chữ nhỏ như thanh dưới đáy cửa hàng. Tiêu đề trang chữ mực.
- Dòng giỏ: lưới ảnh · tên · thành tiền; hàng dưới là **− số +** bên trái, "Xoá" bên phải.
  **Một form, ba nút submit, mỗi nút mang SỐ LƯỢNG ĐÍCH** (`name="qty" value="N"`). Trình duyệt
  chỉ gửi name/value của nút được bấm nên không cần JavaScript, và server giữ nguyên hợp đồng
  (`variant_id` + `qty`, 0 = xoá). Mang số đích (không phải "+1") là thứ làm nó chịu được bấm lặp:
  bấm "+" hai lần trước khi trang kịp tải lại gửi hai lần qty=3, giỏ ra 3 chứ không ra 4. Nút "+"
  khoá ở 1000 (trần của `updateItemForm`) thay vì gửi 1001 vào trang lỗi 400.

### 5. Trang sản phẩm ở 320px (lỗi có từ trước, tìm ra bằng probe của đợt này)

- Thanh mua `[SL][Thêm vào giỏ][Mua ngay]` nowrap có min-content ~351px; cột `1fr` không co
  dưới min-content nên ở 320px cả cột thông tin nở ra 311px, trang cuộn ngang 31px. Nay cột là
  `minmax(0,1fr)`, và ≤374px ô số lượng + chữ nút nhỏ lại (chữ vừa khít: 107/107px).
- Ô chọn ảnh của form "Viết đánh giá": bề rộng nội tại 378px không co (đúng lớp lỗi
  `input[type=file]` ở trang nhập của quản trị) — thêm `max-width:100%`.

## Giới hạn đã biết — nói thẳng

- Chân trang vẫn liệt kê "Chuyển khoản QR" cho mọi shop: trang cửa hàng không biết shop đã bật
  QR hay chưa. Shop chưa bật QR thì dòng đó sai. Chưa sửa.
- Số "đã bán" và số sao trong ảnh chụp là **số giả** để dựng nhãn; worker tự trả cột cache về số
  thật sau vài phút, nên mỗi lượt chụp phải nạp lại.
- Giỏ bỏ ô gõ số: khách mua sỉ 50 cái phải bấm "+" 50 lần (trang sản phẩm vẫn có ô số lượng).
- Mẫu *Thực phẩm* vẫn là kiểu tạp hoá (rau củ, đặc sản). Cửa hàng kiểu thực đơn cho quán ăn là
  ngành riêng, làm ở đợt sau.

## Kiểm chứng

| đo | trước | sau |
|---|---:|---:|
| điện thoại, trang chủ: thẻ SP đầu tiên (y, màn 844) | 1146–1201 | **684** (cả 5 mẫu) |
| điện thoại, `/products` | 1021–1042 | **329** |
| máy tính, trang chủ (màn 800) | 1134 | 946–952 |
| máy tính, `/products` | 357 | 320 |
| giỏ 390px: đầu trang cao · lối tắt | tên + 2 lối tắt gãy dòng | 61px, một dòng tên |
| giỏ 390px: nút "Thanh toán" | dưới màn đầu | trong màn đầu |

- Ảnh 390×844 + 1366×800 cho cả 5 mẫu (trang chủ, `/products`, trang SP) và giỏ/thanh toán,
  trước và sau; đã mở từng ảnh ra xem. Nhìn bắt được 3 lỗi mà phép đo không thấy (mục dưới).
- Bấm thật trên `/cart` khi **tắt JavaScript**: 1 → "+" → 2 → "+" → 3 → "−" → 2 → "Xoá" →
  "Giỏ hàng trống", tổng tiền đổi đúng mỗi bước.
- Tràn ngang: trang chủ / `/products` / trang SP / giỏ / thanh toán × 320·360·390 × JS bật/tắt =
  **30/30 phép đo 0 tràn** (dùng `doTranNgang` của `scripts/probe-360.mjs`). Đột biến chính probe
  (`PROBE_TIEM=1`, khối 3000px): **0/30** — bắt được ở mọi phép đo.
- Unit mới `apps/storefront/test/ban-le.test.js` **13/13**, `presets.test.js` **24/24**.
- Ma trận **17/17 đột biến đỏ**, đối chứng đầu/cuối xanh:

| đột biến | kết quả |
|---|---|
| mẫu có lại `topbar_text` | presets 23/1 |
| cam kết mặc định storefront hứa thay shop | 10/3 |
| chỉ đổi cam kết mặc định ở admin | 12/1 |
| "Bán chạy" khi `sold_count > 0` | 12/1 |
| ô -% về lại dòng giá thẻ | 12/1 |
| bộ lọc điện thoại `<details open>` | 12/1 |
| bỏ điều kiện nút "Bộ sưu tập" | 12/1 |
| giỏ: "+" bỏ trần 1000 | 12/1 |
| giỏ: "+" không khoá ở trần | 12/1 |
| giỏ: nút mang "+1" thay vì số đích | 11/2 |
| giỏ: ô gõ số trở lại | 12/1 |
| giỏ: "Xoá" gửi 1 | 12/1 |
| đầu trang: tên shop chữ gradient | 12/1 |
| đầu trang: lối tắt gãy dòng | 12/1 |
| dòng giỏ: cột giữa `1fr` | 12/1 |
| trang SP: cột `1fr` ở ≤720px | 12/1 |
| form đánh giá: bỏ `max-width` ô ảnh | 12/1 |

## Lỗi của chính lượt này

- **`.section{padding:… 0}` viết SAU `.wrap` xoá mất lề ngang** của `<main class="wrap section">`
  — cùng độ ưu tiên thì quy tắc sau thắng. Thẻ sản phẩm dính sát mép màn. Chỉ thấy khi mở ảnh;
  sửa bằng `.wrap.section` (0,2,0).
- **Giá trong một hàng thẻ lệch nhau** vì `.card .price{margin-top:auto}` đẩy giá xuống đáy thẻ
  cao nhất còn thẻ khác thì không. Cũng chỉ thấy khi nhìn.
- **Khoảng trống lớn trên trang chủ điện thoại** (lề trên của hàng danh mục + section) — đo "thẻ
  đầu tiên ở y=?" vẫn thấy cải thiện nên suýt bỏ qua; nhìn ảnh mới thấy màn đầu trống một khúc.
- **Số "đã bán" giả bị worker trả về 0** giữa hai lượt chụp — ảnh sau không có nhãn "Bán chạy"
  và trông như bản sửa không chạy. Nay mỗi mẫu nạp lại số giả ngay trước khi chụp.
- Bộ chốt mới đỏ một ca vì **fixture** chứ không vì sản phẩm: bố cục thử thiếu khối footer nên
  "huy hiệu chân trang" không thể có. Thêm header/hero/footer vào bố cục thử.
- `scripts/probe-360.mjs` viết cho trang quản trị: trên cửa hàng nó báo đỏ giả cho ô chống bot
  `.hp` (left:-9999px) và checkbox ẩn 1px của menu. Driver của đợt này lọc đúng hai loại đó (rộng
  ≤2px hoặc nằm hẳn bên trái màn) và đột biến lại chính probe sau khi lọc. Đường dẫn Chromium mặc
  định của probe cũng đã cũ (`chromium_headless_shell-1194` không còn) — phải đặt `PROBE_CHROME`.
- Lời gọi `ctx.request` của Playwright chạy ở Node, **không** đi qua `--host-resolver-rules` của
  trình duyệt — nạp giỏ phải gọi `fetch` từ trong trang.
