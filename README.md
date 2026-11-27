# Võ Lâm Lười Android 1.1.0

App Android chạy game https://volamidle.pages.dev trong nhiều ô (WebView), dùng lại phần chạy trong game của **LuoiSpeed V1.0 (V11.20.1)**, thêm:

- **Đổi IP theo nhóm (proxy)**: mỗi nhóm (vd 3 acc) dùng 1 proxy riêng — nhóm 1 → proxy 1, nhóm 2 → proxy 2… Đổi lúc mọi ô đã đóng, kiểm IP xong mới mở nhóm. Proxy chết → tự dùng proxy kế. Hết proxy → dừng hoặc chạy IP thật (tùy chọn).
- **Xoay nhóm như LuoiSpeed**: mỗi nhóm 3–8 acc, chạy 1–180 phút/nhóm → ủy thác → đóng → nhóm kế. Có thể lặp lại từ đầu.
- **Đăng ký nhanh**: acc chưa có thì tự bấm "Đăng Ký" ở màn chào, điền tài khoản + mật khẩu.
- **Tạo nhân vật hệ Hỏa, giới tính Nữ** (đổi được hệ / giới tính trong Cài đặt). Trùng tên → tự thêm 2 chữ cái.
- **Nhận quà / đổi KNB, mở Hồng Bao / Đại Hồng Bao** (lệnh `daily` / `hbAll` của bản PC), **ủy thác** cuối nhóm.
- Mỗi acc 1 hồ sơ WebView riêng (như `persist:acc_…` của bản PC), mật khẩu mã hóa bằng Android Keystore.
- Chạy nền bằng thông báo thường trực, giữ CPU + Wi-Fi.

## Build APK

### Cách 1 — GitHub (không cần cài gì)
1. Tạo repo mới trên GitHub, đẩy toàn bộ thư mục này lên.
2. Tab **Actions** → "Build APK" tự chạy (hoặc bấm *Run workflow*).
3. Xong (~5 phút) → mở lần chạy → tải **VoLamLuoi-apk** → giải nén → cài `app-release.apk` lên điện thoại.

### Cách 2 — Android Studio
1. Mở thư mục này bằng Android Studio (Ladybug trở lên), chờ Gradle tải xong.
2. *Build › Build APK(s)*. APK ở `app/build/outputs/apk/`.

Nếu sửa `core/` hoặc `tools/addon/`, chạy `node tools/bundle.js` để gói lại `app/src/main/assets/game/vll-game.js` (Cách 1 tự làm bước này).

Khóa ký `app/vll.jks` (mật khẩu `vllandroid`) cố định → bản build sau cài đè lên bản trước, không mất danh sách acc. Đây là app tự cài, không đưa lên CH Play.

## Cấu trúc
| Phần | Tệp |
|---|---|
| Phần chạy trong game (gốc LuoiSpeed) | `core/*.js` |
| Đăng ký nhanh, tạo nhân vật, Soi | `tools/addon/10-dangky-taonv.js` |
| Thay `require('electron')` bằng cầu nối Android | `tools/electron-shim.js`, `tools/bundle.js` |
| Bảng điều khiển + bộ xoay nhóm | `app/src/main/assets/ui/` (`engine.js` = điều phối) |
| Android (Java) | `app/src/main/java/vn/hungle/vll/` |

## Giới hạn
- Cần **Android 8+** và **Android System WebView / Chrome bản mới** (có hồ sơ nhiều tài khoản). Máy cũ báo cảnh báo ở đầu app.
- Mỗi ô là một trình duyệt: 4 ô cần máy ~6 GB RAM, 8 ô cần ~8–12 GB. Thiếu RAM Android sẽ đóng ô (nhật ký ghi "ô game bị Android đóng").
- Tắt tối ưu pin cho app. Tắt màn hình lâu một số máy vẫn hạn chế vẽ game — bật "Giữ màn hình sáng" nếu cần.
- **Màn Đăng Ký và Tạo nhân vật được dò theo chữ trên nút** (chưa đối chiếu giao diện thật). Không thấy nút → lưu **bản Soi** → Nhật ký › *Gửi bản Soi* để chỉnh lại cho đúng.
- Đổi IP dùng **proxy HTTP / SOCKS5** (proxy áp cho cả app). Android chỉ bật được 1 VPN và app không điều khiển được app VPN khác. SOCKS5 có mật khẩu WebView không hỗ trợ → dùng HTTP có mật khẩu.
- Chưa có: Bảng tổng đầy đủ, lịch Boss HK / Dã Tẩu / Tháp như bản PC, Discord, bản vá `.vlp`, module `.vlm`, đổi VPN.

## Kiểm thử (trên máy làm việc, game giả lập)
- `python3 tools/test/test-game.py` — phần chạy trong game: đăng ký, đăng nhập, tạo nhân vật Hỏa/Nữ, chọn nhân vật, Soi.
- `node tools/test/test-engine.js` — bộ xoay nhóm.
- `python3 tools/test/test-ui.py` — bảng điều khiển trên khung điện thoại.
