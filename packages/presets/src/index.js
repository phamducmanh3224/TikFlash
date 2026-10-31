/**
 * Thư viện PRESET giao diện theo ngành — nguồn DUY NHẤT dùng chung.
 *
 *   - seller-admin: nút "Đổi giao diện theo ngành" đọc preset rồi PUT qua service seller.
 *   - signup:       chọn ngành lúc đăng ký → seed 1 row `themes` từ preset (cùng tx provision).
 *
 * Mỗi preset = một bộ {tokens, layout} lưu sẵn — ĐÚNG hình dạng bảng `themes`
 * (tokens jsonb, layout jsonb). Engine render (apps/storefront/src/theme.js) đọc thẳng:
 * tokensToCss(tokens) → CSS :root; layout [{section,props}] → map qua registry SECTIONS.
 *
 * HỢP ĐỒNG BẮT BUỘC (nếu vi phạm, storefront âm thầm rớt về mặc định MAISON — có test chặn):
 *   - tokens CHỈ chứa 11 khoá: 9 màu (color.*) + radius + spacing. Màu khớp /^#hex 3-8/,
 *     radius/spacing khớp /^\d{1,4}(px|rem|em|%)$/  (theme.js:41-43).
 *   - TUYỆT ĐỐI KHÔNG font.* — nền tảng chỉ tự-host 'Be Vietnam Pro', CSP chặn font ngoài.
 *   - layout dùng section trong registry (theme.js:250): header, hero, features, collections,
 *     product_grid, product_spotlight, category_bar, category_rows, flash_sale, blog, story,
 *     footer. header đầu, footer cuối, hero gần đầu.
 *   - hero.props.slides = [] RỖNG: banner do CHỦ SHOP tự upload (áp preset giữ nguyên ảnh cũ).
 *   - nav_links ≤ 6, url nội bộ '/...'. Ở đây trỏ /products* (luôn resolve, không 404);
 *     chủ shop tự trỏ lại danh mục thật /c/<slug> sau. sort lạ tự về 'new' nên không gãy.
 *   - KHÔNG LỜI HỨA THAY SHOP (31/10/2026). Preset được chép nguyên vào theme của shop lúc đăng
 *     ký, nên mọi câu ở đây hiện ra như lời CHÍNH SHOP nói với khách. Bản cũ in "Miễn phí giao
 *     hàng cho đơn từ 500.000₫", "Đổi trả 30 ngày", "Bảo hành khung 5 năm · 2 showroom Hà Nội
 *     & TP.HCM", "đạt chuẩn VietGAP" cho mọi shop chọn ngành đó — shop chưa đọc lại là đã hứa.
 *     Nên: không topbar_text (thanh thông báo chỉ hiện khi shop tự viết), features KHÔNG có
 *     items (storefront dùng 4 câu mặc định chỉ nói điều nền tảng bảo đảm, theme.js
 *     DEFAULT_FEATURES), không nav_links mang tên danh mục mà shop chưa có (mọi link đó đều trỏ
 *     /products — bấm "Hàng nam" ra cả hàng nữ). Chữ hero chỉ tả MẶT HÀNG, không tả chính sách.
 *     Chốt: test/presets.test.js quét các cụm hứa hẹn.
 *
 * Đây là MODULE LÁ: chỉ dữ liệu + hàm thuần, ZERO import (không kéo theme.js vào 3 service).
 */

export const PRESETS = {
  // ── Thời trang — editorial, đơn sắc ink lạnh + nhấn crimson, cạnh sắc, lookbook ──
  fashion: {
    name: 'Thời trang',
    description: 'Editorial tối giản, tương phản cao, một nhấn đỏ crimson, lưới sản phẩm dày kiểu lookbook.',
    tokens: {
      'color.primary': '#17171a',
      'color.primary-dark': '#000000',
      'color.accent': '#cf1b3b',
      'color.bg': '#ffffff',
      'color.surface': '#f4f4f6',
      'color.hero-bg': '#ededf1',
      'color.text': '#17171a',
      'color.muted': '#6b6b73',
      'color.border': '#e3e3e8',
      radius: '2px',
      spacing: '18px',
    },
    layout: [
      { section: 'header', props: {
        nav_style: 'band',
        menu_show_featured: false, menu_show_new: true, menu_show_sale: true,
      } },
      { section: 'hero', props: {
        variant: 'split',
        eyebrow: 'Bộ sưu tập Thu Đông 2026',
        title: 'Phong cách định hình dấu ấn riêng',
        subtitle: 'Thiết kế chọn lọc, chất liệu cao cấp và những đường cắt tôn dáng — dành cho người mặc muốn nói lên cá tính mà không cần phô trương.',
        slides: [],
      } },
      { section: 'hero_side', props: { slides: [] } },
      { section: 'features', props: {} },
      { section: 'flash_sale', props: { title: 'Săn deal hôm nay' } },
      { section: 'promo_banners', props: { title: 'Ưu đãi nổi bật', slides: [] } },
      { section: 'category_bar', props: {} },
      { section: 'product_grid', props: { title: 'Hàng mới về', columns: 4, limit: 8 } },
      { section: 'category_rows', props: {} },
      { section: 'story', props: {} },
      { section: 'blog', props: {} },
      { section: 'footer', props: {} },
    ],
  },

  // ── Thực phẩm – Đồ uống — cam ấm gần gũi + đỏ cà chua cho ưu đãi, nền kem, bo tròn ──
  // Chủ dự án chọn CAM cho hướng quán ăn (31/10/2026, docs/82). Cam "đẹp" nhất (#f97316) chỉ
  // đạt 2,8:1 với chữ trắng, mà storefront in chữ TRẮNG trên primary ở thanh topbar, thanh
  // menu dạng band (preset này dùng), huy hiệu giỏ và nút chính — chữ đó sẽ khó đọc ngoài
  // nắng, đúng lúc khách đặt cơm trưa bằng điện thoại. Nên primary là cam đậm #c4470b (4,94:1)
  // và accent #d32f2f (4,98:1): cả hai ≥ 4,5:1 — chuẩn chữ thường của docs/44. Chốt ở
  // apps/checkout/test/do-an.test.js; đổi sang cam sáng hơn là chốt đó ĐỎ.
  food: {
    name: 'Thực phẩm – Đồ uống',
    description: 'Cam ấm gần gũi + đỏ ưu đãi, nền kem: thanh danh mục, lưới ưu đãi, và các hàng sản phẩm TỰ LƯỚT theo danh mục — hợp quán ăn, đồ uống, thực phẩm.',
    tokens: {
      'color.primary': '#c4470b',
      'color.primary-dark': '#9a3412',
      'color.accent': '#d32f2f',
      'color.bg': '#ffffff',
      'color.surface': '#fff7ed',
      'color.hero-bg': '#ffedd5',
      'color.text': '#2b1a10',
      'color.muted': '#7a5c48',
      'color.border': '#f3dfca',
      radius: '8px',
      spacing: '16px',
    },
    layout: [
      { section: 'header', props: {
        nav_style: 'band',
        menu_show_featured: true, menu_show_new: true, menu_show_sale: true,
      } },
      { section: 'hero', props: {
        variant: 'split',
        eyebrow: 'Tươi ngon mỗi ngày',
        title: 'Thực phẩm sạch, chọn kỹ từ nông trại',
        subtitle: 'Rau củ, trái cây và đặc sản chọn lọc cho bữa cơm nhà bạn.',
        slides: [],
      } },
      { section: 'hero_side', props: { slides: [] } },
      { section: 'features', props: {} },
      { section: 'flash_sale', props: { title: 'Giờ vàng giá sốc' } },
      { section: 'promo_banners', props: { title: 'Ưu đãi nổi bật', slides: [] } },
      { section: 'category_bar', props: {} },
      { section: 'product_grid', props: { title: 'Ưu đãi hôm nay', columns: 4, limit: 8 } },
      { section: 'category_rows', props: {} },
      { section: 'story', props: {} },
      { section: 'blog', props: {} },
      { section: 'footer', props: {} },
    ],
  },

  // ── Nội thất — showroom kiểu Sofa Ngọc Việt: xanh slate + cam terracotta, GÓC VUÔNG (radius 0),
  //    nền trắng/xám nhạt, duyệt theo danh mục (thanh danh mục + khối SP từng loại). ──
  furniture: {
    name: 'Nội thất',
    description: 'Showroom nội thất kiểu Sofa Ngọc Việt: xanh slate + cam terracotta trên nền trắng/xám nhạt, GÓC VUÔNG chuyên nghiệp, thanh danh mục + các khối sản phẩm theo loại (sofa, giường, bàn ăn…).',
    tokens: {
      'color.primary': '#446084',
      'color.primary-dark': '#35506e',
      'color.accent': '#d26e4b',
      'color.bg': '#ffffff',
      'color.surface': '#f8f8f9',
      'color.hero-bg': '#eef1f6',
      'color.text': '#333333',
      'color.muted': '#777777',
      'color.border': '#dddddd',
      radius: '0px',
      spacing: '20px',
    },
    layout: [
      { section: 'header', props: {
        nav_style: 'band',
        menu_show_featured: true, menu_show_new: true, menu_show_sale: true,
      } },
      { section: 'hero', props: {
        variant: 'split',
        eyebrow: 'Nội thất cho ngôi nhà của bạn',
        title: 'Kiến tạo không gian sống đẳng cấp',
        subtitle: 'Sofa, giường, bàn ăn thiết kế tinh tế cho từng góc nhà.',
        slides: [],
      } },
      { section: 'hero_side', props: { slides: [] } },
      { section: 'features', props: {} },
      { section: 'flash_sale', props: { title: 'Ưu đãi có hạn' } },
      { section: 'promo_banners', props: { title: 'Ưu đãi nổi bật', slides: [] } },
      { section: 'category_bar', props: {} },
      { section: 'product_grid', props: { title: 'Mẫu mới về', columns: 4, limit: 8 } },
      { section: 'category_rows', props: {} },
      { section: 'story', props: {} },
      { section: 'blog', props: {} },
      { section: 'footer', props: {} },
    ],
  },

  // ── Mỹ phẩm — hồng M.O.I: hồng thương hiệu ấm + hồng nóng ưu đãi, nền trắng/kem ấm, FLASH SALE ──
  cosmetics: {
    name: 'Mỹ phẩm',
    description: 'Beauty kiểu M.O.I: hồng thương hiệu tươi + hồng nóng ưu đãi trên nền trắng/kem ấm, FLASH SALE đếm ngược, lưới bán chạy 5 cột — nữ tính, hiện đại, hướng khuyến mãi.',
    tokens: {
      'color.primary': '#f36b7d',
      'color.primary-dark': '#e5697d',
      'color.accent': '#f84969',
      'color.bg': '#ffffff',
      'color.surface': '#fdf6f3',
      'color.hero-bg': '#fdeef1',
      'color.text': '#1f1a1c',
      'color.muted': '#777777',
      'color.border': '#f2dfe3',
      radius: '12px',
      spacing: '16px',
    },
    layout: [
      { section: 'header', props: {
        nav_style: 'band',
        menu_show_featured: true, menu_show_new: true, menu_show_sale: true,
      } },
      { section: 'hero', props: {
        variant: 'split',
        eyebrow: 'Chăm sóc da mỗi ngày',
        title: 'Tháng này chốt deal — nuông chiều phái đẹp',
        subtitle: 'Trang điểm, chăm sóc da và nước hoa — chọn món hợp với làn da của bạn.',
        slides: [],
      } },
      // Section DỮ-LIỆU (không tự render): giữ 2 banner PHỤ bên phải hero split. Storefront hero
      // split đọc slides ở đây; chủ shop upload qua form "Banner phụ hero" trong Giao diện.
      { section: 'hero_side', props: { slides: [] } },
      { section: 'features', props: {} },
      { section: 'flash_sale', props: { title: 'Flash sale' } },
      { section: 'promo_banners', props: { title: 'Ưu đãi nổi bật', slides: [] } },
      { section: 'category_bar', props: {} },
      { section: 'product_grid', props: { title: 'Sản phẩm bán chạy', columns: 5 } },
      { section: 'category_rows', props: {} },
      { section: 'story', props: {} },
      { section: 'blog', props: {} },
      { section: 'footer', props: {} },
    ],
  },

  // ── Đa ngành — trung tính, dùng khi shop không thuộc 4 nhóm trên ──────────────
  //
  // Vừa là lựa chọn "Khác" trên form đăng ký, VỪA là preset rơi-về khi để trống.
  // Vì sao phải có: không chọn ngành thì trước đây shop KHÔNG có dòng themes, và
  // DEFAULT_LAYOUT của storefront chỉ 5 khối (không hero_side/promo_banners/
  // flash_sale/category_bar) → cả một nhóm shop nhận bố cục cũ, và banner mặc
  // định (0114) không với tới được vì không có gì để ghi vào.
  //
  // Palette cố ý NHẠT và không mang tính ngành nào: xanh mực trung tính + nhấn
  // teal. Shop đổi sang preset khác hay tự chỉnh màu đều không thấy hụt hẫng.
  general: {
    name: 'Khác / Đa ngành',
    description: 'Trung tính, sạch, hợp mọi mặt hàng — đổi màu và bố cục sau lúc nào cũng được.',
    tokens: {
      'color.primary': '#1f2933',
      'color.primary-dark': '#0f1721',
      'color.accent': '#0f8b8d',
      'color.bg': '#ffffff',
      'color.surface': '#f5f7f8',
      'color.hero-bg': '#eceff1',
      'color.text': '#1f2933',
      'color.muted': '#6b7680',
      'color.border': '#dfe4e8',
      radius: '8px',
      spacing: '18px',
    },
    layout: [
      { section: 'header', props: {
        nav_style: 'band',
        menu_show_featured: true, menu_show_new: true, menu_show_sale: true,
        nav_links: [
          { label: 'Tất cả sản phẩm', url: '/products' },
          { label: 'Hàng mới', url: '/products?sort=new' },
          { label: 'Khuyến mãi', url: '/products?sort=sale' },
        ],
      } },
      { section: 'hero', props: {
        variant: 'split',
        eyebrow: 'Cửa hàng trực tuyến',
        title: 'Mua sắm dễ dàng, giao tận nơi',
        subtitle: 'Chọn sản phẩm, đặt hàng trong vài bước và trả tiền khi nhận hàng.',
        slides: [],
      } },
      { section: 'hero_side', props: { slides: [] } },
      { section: 'features', props: {} },
      { section: 'flash_sale', props: { title: 'Ưu đãi có hạn' } },
      { section: 'promo_banners', props: { title: 'Ưu đãi nổi bật', slides: [] } },
      { section: 'category_bar', props: {} },
      { section: 'product_grid', props: { title: 'Sản phẩm nổi bật', columns: 4, limit: 8 } },
      { section: 'category_rows', props: {} },
      { section: 'story', props: {} },
      { section: 'blog', props: {} },
      { section: 'footer', props: {} },
    ],
  },
};

/** Preset dùng khi shop không chọn ngành (hoặc chọn giá trị lạ). */
export const FALLBACK_PRESET = 'general';

/** Trả preset theo slug ngành, hoặc null nếu không có (slug lạ → gọi phía dùng tự bỏ qua). */
export const getPreset = (slug) => (typeof slug === 'string' && Object.hasOwn(PRESETS, slug)) ? PRESETS[slug] : null;

/** Danh sách slug ngành có preset. */
export const listPresets = () => Object.keys(PRESETS);

/** [{slug, name, description}] — dựng menu chọn ngành (signup form, seller-admin picker). */
export const presetChoices = () => Object.entries(PRESETS).map(([slug, p]) => ({ slug, name: p.name, description: p.description }));
