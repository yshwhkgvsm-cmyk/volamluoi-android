package vn.hungle.vll;

import android.annotation.SuppressLint;
import android.graphics.Bitmap;
import android.os.SystemClock;
import android.view.MotionEvent;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.ProfileStore;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Collections;

/** 1 ô game = 1 WebView. Mỗi tài khoản 1 hồ sơ riêng (localStorage / cookie riêng) như partition "persist:acc_…" của bản PC. */
class GameSlot {
    final MainActivity act;
    final int idx;
    WebView web;
    volatile String creds = "null";
    volatile String url = "";

    GameSlot(MainActivity act, int idx) { this.act = act; this.idx = idx; }

    static String profileOf(String user) { return "acc_" + String.valueOf(user).toLowerCase().replaceAll("[^a-z0-9_]", "_"); }

    static void dropProfile(String user) {
        try { if (WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)) ProfileStore.getInstance().deleteProfile(profileOf(user)); } catch (Exception ignored) { }
    }

    @SuppressLint({"SetJavaScriptEnabled", "JavascriptInterface"})
    void open(String credsJson) {
        close();
        creds = credsJson == null ? "null" : credsJson;
        String user = "";
        try { user = new JSONObject(creds).optString("user", ""); } catch (Exception ignored) { }
        web = new WebView(act);
        boolean multi = WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE);
        if (multi) {   // phải gọi trước mọi hàm khác của WebView
            String p = profileOf(user);
            ProfileStore.getInstance().getOrCreateProfile(p);
            WebViewCompat.setProfile(web, p);
        }
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUseWideViewPort(true);          // bày như màn hình máy tính rồi thu nhỏ vừa ô
        s.setLoadWithOverviewMode(true);
        s.setTextZoom(100);
        s.setSupportZoom(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setAllowFileAccess(false);
        if (!multi) CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);
        web.addJavascriptInterface(new GameBridge(), "VLLAndroid");
        final boolean early = WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT);
        if (early) WebViewCompat.addDocumentStartJavaScript(web, act.gameJs, Collections.singleton(MainActivity.GAME_ORIGIN));
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override public void onPageStarted(WebView v, String u, Bitmap f) {
                url = u == null ? "" : u;
                if (!early && isGame()) v.evaluateJavascript(act.gameJs, null);   // máy cũ: chèn muộn (có thể lỡ bước đầu)
            }
            @Override public boolean onRenderProcessGone(WebView v, RenderProcessGoneDetail d) {
                act.slotEvent(idx, "crash");
                act.main.post(() -> { close(); act.layoutSlots(); });
                return true;
            }
        });
        act.gameBox.addView(web);
        web.loadUrl(MainActivity.GAME_URL);
    }

    void reload(String credsJson) {
        if (web == null) { open(credsJson); act.layoutSlots(); return; }
        creds = credsJson == null ? "null" : credsJson;
        web.loadUrl(MainActivity.GAME_URL);
    }

    void close() {
        if (web == null) return;
        WebView w = web;
        web = null;
        creds = "null";
        try { act.gameBox.removeView(w); w.stopLoading(); w.loadUrl("about:blank"); w.removeJavascriptInterface("VLLAndroid"); w.destroy(); } catch (Exception ignored) { }
    }

    void toGame(String ch, String argsJson) {
        if (web == null) return;
        String args = argsJson == null || argsJson.isEmpty() ? "[]" : argsJson;
        try { new JSONArray(args); } catch (Exception e) { return; }   // chỉ nhận mảng JSON hợp lệ
        web.evaluateJavascript("window.__vllIpc&&__vllIpc(" + JSONObject.quote(ch) + "," + args + ")", null);
    }

    boolean isGame() { return url.startsWith(MainActivity.GAME_ORIGIN + "/") || url.equals(MainActivity.GAME_ORIGIN); }

    /** Bấm thật vào ô (cho "chạy né quái" của bản PC: lab:kite:click). x, y theo px CSS của trang. */
    @SuppressWarnings("deprecation")
    void tap(final double x, final double y) {
        if (web == null) return;
        float sc = web.getScale();
        float px = (float) (x * sc), py = (float) (y * sc);
        long t = SystemClock.uptimeMillis();
        MotionEvent d = MotionEvent.obtain(t, t, MotionEvent.ACTION_DOWN, px, py, 0);
        MotionEvent u = MotionEvent.obtain(t, t + 40, MotionEvent.ACTION_UP, px, py, 0);
        web.dispatchTouchEvent(d);
        web.dispatchTouchEvent(u);
        d.recycle();
        u.recycle();
    }

    /** Cầu nối trong trang game (window.VLLAndroid). Chỉ trả lời khi ô đang ở đúng trang game. */
    class GameBridge {
        @JavascriptInterface public void send(String json) {
            if (!isGame() || json == null || json.length() > 200000) return;
            if (json.startsWith("[\"lab:kite:click\"")) {
                try { final JSONArray a = new JSONArray(json); act.main.post(() -> tap(a.optDouble(1), a.optDouble(2))); } catch (Exception ignored) { }
                return;
            }
            act.deliver(idx, json);
        }
        @JavascriptInterface public String creds() { return isGame() ? creds : "null"; }
        @JavascriptInterface public String sync(String ch) { return "null"; }
    }
}
