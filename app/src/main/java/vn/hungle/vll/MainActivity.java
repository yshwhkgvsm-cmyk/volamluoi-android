package vn.hungle.vll;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewFeature;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/**
 * Võ Lâm Lười Android: 1 màn hình. Lớp dưới = các ô game (WebView, mỗi acc 1 hồ sơ riêng), lớp trên = bảng điều khiển (assets/ui).
 * Ô game luôn được bày trên màn hình (bị bảng điều khiển che) để game không bị tạm dừng vẽ.
 */
public class MainActivity extends Activity {
    static final String GAME_URL = "https://volamidle.pages.dev/";
    static final String GAME_ORIGIN = "https://volamidle.pages.dev";
    static final int MAX_SLOTS = 8;

    final Handler main = new Handler(Looper.getMainLooper());
    final GameSlot[] slots = new GameSlot[MAX_SLOTS];
    FrameLayout root, gameBox;
    WebView ui;
    String gameJs = "";
    String mode = "ui";

    @SuppressLint({"SetJavaScriptEnabled", "JavascriptInterface"})
    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        gameJs = readAsset("game/vll-game.js");
        root = new FrameLayout(this);
        gameBox = new FrameLayout(this);
        gameBox.setBackgroundColor(0xFF000000);
        root.addView(gameBox, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        ui = new WebView(this);
        root.addView(ui, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
        for (int i = 0; i < MAX_SLOTS; i++) slots[i] = new GameSlot(this, i);

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        WebSettings s = ui.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        ui.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                return loader.shouldInterceptRequest(r.getUrl());
            }
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if ("appassets.androidplatform.net".equals(u.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
                return true;
            }
        });
        ui.addJavascriptInterface(new HostBridge(), "VLLHost");
        ui.loadUrl("https://appassets.androidplatform.net/assets/ui/index.html");

        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1);
    }

    String readAsset(String name) {
        try (InputStream in = getAssets().open(name)) {
            ByteArrayOutputStream o = new ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            int n;
            while ((n = in.read(buf)) > 0) o.write(buf, 0, n);
            return new String(o.toByteArray(), StandardCharsets.UTF_8);
        } catch (Exception e) {
            return "";
        }
    }

    /** Bày các ô: lưới 2 cột cho mọi ô đang mở; "slot:i" = ô i phủ toàn màn hình; "ui" = bảng điều khiển che lên trên. */
    void layoutSlots() {
        int w = gameBox.getWidth(), h = gameBox.getHeight();
        if (w <= 0 || h <= 0) { gameBox.post(this::layoutSlots); return; }
        int n = 0;
        for (GameSlot g : slots) if (g.web != null) n++;
        int cols = n <= 1 ? 1 : 2, rows = Math.max(1, (n + cols - 1) / cols);
        int cw = w / cols, ch = h / rows, k = 0;
        int focus = mode.startsWith("slot:") ? parseInt(mode.substring(5), -1) : -1;
        for (GameSlot g : slots) {
            if (g.web == null) continue;
            FrameLayout.LayoutParams lp;
            if (g.idx == focus) lp = new FrameLayout.LayoutParams(w, h);
            else { lp = new FrameLayout.LayoutParams(cw - 2, ch - 2); lp.leftMargin = (k % cols) * cw + 1; lp.topMargin = (k / cols) * ch + 1; }
            g.web.setLayoutParams(lp);
            k++;
        }
        if (focus >= 0 && slots[focus].web != null) slots[focus].web.bringToFront();
        ui.setVisibility("ui".equals(mode) ? View.VISIBLE : View.INVISIBLE);
        if ("ui".equals(mode)) ui.bringToFront();
        root.requestLayout();
    }

    static int parseInt(String s, int d) { try { return Integer.parseInt(s); } catch (Exception e) { return d; } }

    void show(String m) { mode = m == null ? "ui" : m; layoutSlots(); }

    /** Tin từ ô game → bảng điều khiển. */
    void deliver(final int i, final String json) {
        main.post(() -> ui.evaluateJavascript("window.vllOnGame&&vllOnGame(" + i + "," + JSONObject.quote(json) + ")", null));
    }

    void proxyDone(final String id, final String json) {
        main.post(() -> ui.evaluateJavascript("window.vllOnProxy&&vllOnProxy(" + JSONObject.quote(id) + "," + JSONObject.quote(json) + ")", null));
    }

    void slotEvent(final int i, final String ev) {
        main.post(() -> ui.evaluateJavascript("window.vllOnSlot&&vllOnSlot(" + i + "," + JSONObject.quote(ev) + ")", null));
    }

    @Override
    public void onBackPressed() {
        if (!"ui".equals(mode)) { show("ui"); return; }
        moveTaskToBack(true);   // không đóng app: các ô game vẫn chạy nền
    }

    @Override
    protected void onDestroy() {
        for (GameSlot g : slots) g.close();
        if (ProxyMan.cur != null) ProxyMan.apply(this, null, r -> { });   // tắt app → bỏ proxy
        try { ui.destroy(); } catch (Exception ignored) { }
        stopService(new Intent(this, KeepAliveService.class));
        super.onDestroy();
    }

    /** Cầu nối cho bảng điều khiển (assets/ui/app.js). Các hàm chạy trên luồng phụ → việc với View chuyển về luồng chính. */
    class HostBridge {
        @JavascriptInterface public void open(final int i, final String creds) { if (ok(i)) main.post(() -> { slots[i].open(creds); layoutSlots(); }); }
        @JavascriptInterface public void reload(final int i, final String creds) { if (ok(i)) main.post(() -> slots[i].reload(creds)); }
        @JavascriptInterface public void close(final int i) { if (ok(i)) main.post(() -> { slots[i].close(); layoutSlots(); }); }
        @JavascriptInterface public void toGame(final int i, final String ch, final String args) { if (ok(i)) main.post(() -> slots[i].toGame(ch, args)); }
        @JavascriptInterface public void show(final String m) { main.post(() -> MainActivity.this.show(m)); }
        @JavascriptInterface public String enc(String s) { return Crypto.enc(s); }
        @JavascriptInterface public String dec(String s) { return Crypto.dec(s); }
        @JavascriptInterface public String multiProfile() { return String.valueOf(WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)); }
        @JavascriptInterface public void dropProfile(final String user) { main.post(() -> GameSlot.dropProfile(user)); }
        @JavascriptInterface public void toast(final String m) { main.post(() -> Toast.makeText(MainActivity.this, m, Toast.LENGTH_SHORT).show()); }
        @JavascriptInterface public void keepScreen(final boolean on) {
            main.post(() -> { if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); });
        }
        @JavascriptInterface public void keepAlive(final boolean on) {
            main.post(() -> {
                Intent it = new Intent(MainActivity.this, KeepAliveService.class);
                if (!on) { stopService(it); return; }
                if (Build.VERSION.SDK_INT >= 26) startForegroundService(it); else startService(it);
            });
        }
        @JavascriptInterface public void share(final String text, final String name) {
            main.post(() -> {
                try {
                    File f = new File(getCacheDir(), name == null || name.isEmpty() ? "vll.txt" : name.replaceAll("[^\\w.-]", "_"));
                    try (FileOutputStream o = new FileOutputStream(f)) { o.write(text.getBytes(StandardCharsets.UTF_8)); }
                    Intent it = new Intent(Intent.ACTION_SEND);
                    it.setType("text/plain");
                    it.putExtra(Intent.EXTRA_TEXT, text.length() > 90000 ? text.substring(0, 90000) : text);
                    it.putExtra(Intent.EXTRA_SUBJECT, f.getName());
                    startActivity(Intent.createChooser(it, "Gửi bản Soi"));
                } catch (Exception e) {
                    Toast.makeText(MainActivity.this, "Không gửi được: " + e.getMessage(), Toast.LENGTH_LONG).show();
                }
            });
        }
        /** Đổi proxy cho mọi ô (json "null" = về IP thật), kiểm IP xong gọi lại vllOnProxy(id, kết quả). */
        @JavascriptInterface public void setProxy(final String id, final String json) {
            main.post(() -> ProxyMan.apply(MainActivity.this, ProxyMan.parse(json), r -> proxyDone(id, r)));
        }
        /** Chỉ kiểm proxy (không áp cho ô game). */
        @JavascriptInterface public void checkProxy(final String id, final String json) {
            ProxyMan.P p = ProxyMan.parse(json);
            if (p == null) { proxyDone(id, ProxyMan.err("proxy sai dạng")); return; }
            ProxyMan.check(p, r -> proxyDone(id, r));
        }
        boolean ok(int i) { return i >= 0 && i < MAX_SLOTS; }
    }
}
