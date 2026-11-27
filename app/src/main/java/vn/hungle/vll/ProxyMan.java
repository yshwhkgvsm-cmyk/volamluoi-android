package vn.hungle.vll;

import android.util.Base64;

import androidx.webkit.ProxyConfig;
import androidx.webkit.ProxyController;
import androidx.webkit.WebViewFeature;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.Authenticator;
import java.net.HttpURLConnection;
import java.net.InetSocketAddress;
import java.net.PasswordAuthentication;
import java.net.Proxy;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Executor;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Đổi IP cho mọi ô game bằng proxy (ProxyController của WebView: áp cho cả app).
 * Đổi xong kiểm IP qua chính proxy đó rồi mới báo về bảng điều khiển.
 */
final class ProxyMan {
    static final class P {
        String scheme = "http", host = "", user = "", pass = "";
        int port;
        String rule() { return scheme + "://" + host + ":" + port; }
    }

    /** Proxy đang dùng (để trả lời khi proxy hỏi tài khoản). */
    static volatile P cur;

    static P parse(String json) {
        try {
            if (json == null || "null".equals(json)) return null;
            JSONObject o = new JSONObject(json);
            P p = new P();
            p.scheme = o.optString("scheme", "http");
            p.host = o.optString("host", "");
            p.port = o.optInt("port", 0);
            p.user = o.optString("user", "");
            p.pass = o.optString("pass", "");
            return p.host.isEmpty() || p.port <= 0 ? null : p;
        } catch (Exception e) {
            return null;
        }
    }

    interface Done { void done(String resultJson); }

    /** Đặt proxy cho mọi WebView (p = null → bỏ proxy) rồi kiểm IP. */
    static void apply(final MainActivity act, final P p, final Done cb) {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.PROXY_OVERRIDE)) { cb.done(err("WebView của máy không hỗ trợ đổi proxy — cập nhật Android System WebView")); return; }
        final Executor ex = act.main::post;
        final Runnable after = () -> check(p, cb);
        try {
            if (p == null) { cur = null; ProxyController.getInstance().clearProxyOverride(ex, after); return; }
            cur = p;
            ProxyConfig cfg = new ProxyConfig.Builder().addProxyRule(p.rule()).build();
            ProxyController.getInstance().setProxyOverride(cfg, ex, after);
        } catch (Exception e) {
            cb.done(err("không đặt được proxy: " + e.getMessage()));
        }
    }

    /** Hỏi IP công khai qua proxy p (null = đường thật). Chạy luồng riêng. */
    static void check(final P p, final Done cb) {
        new Thread(() -> {
            String last = "không rõ";
            for (String u : new String[]{"http://api.ipify.org", "http://ipv4.icanhazip.com", "http://ifconfig.me/ip"}) {
                HttpURLConnection c = null;
                try {
                    Proxy px = Proxy.NO_PROXY;
                    if (p != null) {
                        boolean socks = p.scheme.startsWith("socks");
                        px = new Proxy(socks ? Proxy.Type.SOCKS : Proxy.Type.HTTP, new InetSocketAddress(p.host, p.port));
                        if (socks && !p.user.isEmpty()) {
                            final String us = p.user, pw = p.pass;
                            Authenticator.setDefault(new Authenticator() {
                                @Override protected PasswordAuthentication getPasswordAuthentication() { return new PasswordAuthentication(us, pw.toCharArray()); }
                            });
                        }
                    }
                    c = (HttpURLConnection) new URL(u).openConnection(px);
                    c.setConnectTimeout(12000);
                    c.setReadTimeout(12000);
                    c.setRequestProperty("User-Agent", "curl/8");
                    if (p != null && !p.scheme.startsWith("socks") && !p.user.isEmpty())
                        c.setRequestProperty("Proxy-Authorization", "Basic " + Base64.encodeToString((p.user + ":" + p.pass).getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP));
                    int code = c.getResponseCode();
                    if (code == 407) { last = "proxy báo sai tên đăng nhập / mật khẩu (407)"; break; }
                    if (code != 200) { last = "mã " + code; continue; }
                    String body = read(c.getInputStream());
                    Matcher m = Pattern.compile("\\b(\\d{1,3}(?:\\.\\d{1,3}){3})\\b").matcher(body);
                    if (m.find()) {
                        JSONObject o = new JSONObject();
                        o.put("ok", true);
                        o.put("ip", m.group(1));
                        cb.done(o.toString());
                        return;
                    }
                    last = "trả về lạ";
                } catch (Exception e) {
                    last = e.getClass().getSimpleName() + (e.getMessage() == null ? "" : ": " + e.getMessage());
                } finally {
                    if (c != null) c.disconnect();
                }
            }
            cb.done(err((p == null ? "mạng thật: " : "") + last));
        }).start();
    }

    static String read(InputStream in) throws Exception {
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        byte[] b = new byte[2048];
        int n;
        while ((n = in.read(b)) > 0 && o.size() < 8192) o.write(b, 0, n);
        return new String(o.toByteArray(), StandardCharsets.UTF_8);
    }

    static String err(String why) {
        try { JSONObject o = new JSONObject(); o.put("ok", false); o.put("why", why); return o.toString(); } catch (Exception e) { return "{\"ok\":false}"; }
    }

    private ProxyMan() { }
}
