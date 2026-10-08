# Nguồn gốc

Chép nguyên từ https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
(thư mục `.claude/skills/ui-ux-pro-max`, commit `1a2c459b35f26116fd165b0a0f30597f252749ff`),
giấy phép MIT — xem `LICENSE` cùng thư mục.

Khác với bản gốc, cố ý và chỉ hai chỗ:

- `SKILL.md`: lệnh gọi script đổi từ `"${CLAUDE_PLUGIN_ROOT}/.claude/skills/…"` sang đường
  dẫn tương đối từ gốc kho (`.claude/skills/ui-ux-pro-max/scripts/search.py`). Biến
  `CLAUDE_PLUGIN_ROOT` chỉ có khi cài dạng plugin; để nguyên thì lệnh thành
  `/.claude/skills/…` và chết ngay.
- Bỏ `scripts/tests/`: bộ test đó tìm gốc kho upstream (`scripts/generate-catalog-summary.py`)
  nên không chạy được ở đây.

Script chỉ dùng thư viện chuẩn Python 3; dữ liệu đọc từ `data/` theo vị trí của chính tệp
script, nên chạy được từ bất kỳ thư mục nào miễn đường dẫn tới `search.py` đúng.

**Luật của kho này thắng gợi ý của skill.** `CLAUDE.md` §3 cấm CDN, font ngoài và JS ngoài
các chỗ đã duyệt; skill này hay gợi ý Google Fonts, Tailwind, GSAP. Dùng nó để chọn hướng
thiết kế, không để chép nguyên dependency vào storefront/checkout.

Cập nhật: chép lại thư mục từ upstream, áp lại hai chỗ khác ở trên, sửa mã commit trong tệp này.
