# Nguồn gốc

Chép nguyên từ https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
(thư mục `.claude/skills/ui-ux-pro-max`, commit `1a2c459b35f26116fd165b0a0f30597f252749ff`),
giấy phép MIT — xem `LICENSE` cùng thư mục.

Khác với bản gốc, cố ý:

- `SKILL.md`: lệnh gọi script đổi từ `"${CLAUDE_PLUGIN_ROOT}/.claude/skills/…"` sang
  `"$(git rev-parse --show-toplevel)/.claude/skills/ui-ux-pro-max/scripts/search.py"`. Biến
  `CLAUDE_PLUGIN_ROOT` chỉ có khi cài dạng plugin; đường tương đối thì chỉ chạy được từ gốc kho.
- `SKILL.md`: thêm khối cảnh báo tiếng Việt ở đầu và một câu ở `description` (luật kho thắng:
  không CDN/font ngoài/JS ở storefront-checkout; hệ thiết kế là docs/44, docs/72; cấm `--persist`).
  Đặt ở SKILL.md vì chỉ tệp này tự nạp — để ở đây thì không ai đọc. Bước "Generate Design
  System" đổi từ REQUIRED sang tuỳ chọn. Bỏ câu trỏ tới README không tồn tại.
- `scripts/design_system.py`: `safe_slug` bỏ dấu tiếng Việt cho slug đọc được và gắn 8 ký tự
  băm của tên gốc khi tên có ký tự bị biến đổi (không thì "Nền tảng" và "Nến tăng" trùng slug); `os.link` lỗi OSError (ổ không hỗ trợ hard link) rơi về tạo tệp
  độc quyền thay vì văng traceback.
- `scripts/search.py`: docstring liệt kê đủ 22 stack như `AVAILABLE_STACKS`.
- Bỏ `scripts/tests/` (tìm gốc kho upstream nên không chạy được ở đây), `scripts/validate_data.py`
  (công cụ bảo trì dữ liệu của upstream) cùng hai tệp chỉ nó đọc:
  `data/phosphor-icons-upstream.json`, `data/google-font-licenses.json` (~1,2MB). Tìm kiếm không
  đọc chúng. `data/catalog-summary.json` vẫn nhắc tên hai tệp — chỉ là siêu dữ liệu, không ai đọc.
- Phần thân SKILL.md và `references/` giữ tiếng Anh nguyên bản: đây là văn bản chép từ upstream,
  dịch ra thì mỗi lần cập nhật phải dịch lại và dễ trôi khỏi bản gốc. Phần do kho viết thêm
  (khối cảnh báo, tệp này) dùng tiếng Việt theo CLAUDE.md §0.

Script chỉ dùng thư viện chuẩn Python 3; dữ liệu đọc từ `data/` theo vị trí của chính tệp
script, nên chạy được từ bất kỳ thư mục nào miễn đường dẫn tới `search.py` đúng.

**Luật của kho này thắng gợi ý của skill.** `CLAUDE.md` §3 cấm CDN, font ngoài và JS ngoài
các chỗ đã duyệt; skill này hay gợi ý Google Fonts, Tailwind, GSAP. Dùng nó để chọn hướng
thiết kế, không để chép nguyên dependency vào storefront/checkout.

Cập nhật: chép lại thư mục từ upstream, áp lại các chỗ khác ở trên, sửa mã commit trong tệp này.
