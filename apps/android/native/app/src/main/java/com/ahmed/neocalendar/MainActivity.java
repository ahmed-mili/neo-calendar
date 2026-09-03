package com.ahmed.neocalendar;

import android.app.*;
import android.os.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.database.Cursor;
import android.graphics.Color;
import android.util.Log;
import android.net.Uri;
import android.util.Base64;
import android.provider.DocumentsContract;
import android.webkit.*;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

public class MainActivity extends Activity {
  private static final String TAG = "NeoCalendar";
  private static final String APP_HOST = "neo-calendar.local";
  private static final String APP_URL = "https://" + APP_HOST + "/index.html";
  private WebView webView;
  private AppUpdater appUpdater;
  private WallpaperStore wallpapers;

  /** How long the splash screen may wait on the interface before giving up. */
  private static final long SPLASH_TIMEOUT_MS = 6000L;

  private volatile boolean interfaceReady = false;

  /** Which event a widget tap wants opened, if any. */
  static final String EXTRA_EVENT_ID = "neoCalendarEventId";

  /** Pose par l'action « Reessayer » de la notification d'echec. */
  static final String EXTRA_UPDATE_RETRY = "neoCalendarUpdateRetry";

  /** Held until the page can hear it: a widget tap can start the app cold. */
  private String pendingWidgetRoute = null;
  private android.widget.FrameLayout rootView;
  private int neoInsetTop = 32;
  private int neoInsetRight = 0;
  private int neoInsetBottom = 0;
  private int neoInsetLeft = 0;
  /*
   * Deux files, et c'est le fond du probleme de lancement.
   *
   * `io` est volontairement a un seul fil : les ecritures dans le dossier de
   * donnees s'y font l'une apres l'autre, ce qui evite qu'une sauvegarde et une
   * suppression se croisent sur le meme fichier. Tant que le reseau partageait
   * ce fil, une requete lente y bloquait tout le reste — la lecture du dossier
   * au demarrage attendait derriere la verification de mise a jour, puis
   * derriere l'abonnement ICS, et l'ecran de demarrage restait la. Sans reseau
   * les memes requetes echouaient aussitot, le fil se liberait, et
   * l'application s'ouvrait sur-le-champ : elle demarrait donc plus vite hors
   * ligne qu'en ligne.
   *
   * `net` porte maintenant tout ce qui sort de l'appareil. Les fichiers ne
   * l'attendent plus, et plusieurs requetes peuvent avancer de front.
   */
  private final ExecutorService io = Executors.newSingleThreadExecutor();
  private final ExecutorService net = Executors.newFixedThreadPool(3);
  private String pendingPickerId;
  private boolean pendingMultiple;
  private static final int PICK_TREE=4101, PICK_FILES=4102;
  private static final String PREF_FILE="neo_android", PREF_TREE="tree_uri";
  private static final String PREFERENCES_FILE_NAME=".neo-calendar.json";
  private static final String LEGACY_PREFERENCES_FILE_NAME=".neo-calendar-desktop.json";

  @Override public void onCreate(Bundle state) {
    super.onCreate(state);

    final android.view.Window window = getWindow();
    window.addFlags(android.view.WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
    window.setStatusBarColor(Color.TRANSPARENT);
    window.setNavigationBarColor(Color.TRANSPARENT);

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      window.setStatusBarContrastEnforced(false);
      window.setNavigationBarContrastEnforced(false);
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      window.setDecorFitsSystemWindows(false);
      android.view.WindowInsetsController controller = window.getDecorView().getWindowInsetsController();
      if (controller != null) {
        controller.setSystemBarsAppearance(
          0,
          android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS |
            android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
        );
      }
    } else {
      int flags = android.view.View.SYSTEM_UI_FLAG_LAYOUT_STABLE |
        android.view.View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
        android.view.View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION;
      flags &= ~android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        flags &= ~android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
      }
      window.getDecorView().setSystemUiVisibility(flags);
    }

    rootView = new android.widget.FrameLayout(this);
    rootView.setBackgroundColor(Color.rgb(17, 17, 27));

    webView = new WebView(this);
    webView.setBackgroundColor(Color.TRANSPARENT);
    rootView.addView(
      webView,
      new android.widget.FrameLayout.LayoutParams(
        android.view.ViewGroup.LayoutParams.MATCH_PARENT,
        android.view.ViewGroup.LayoutParams.MATCH_PARENT
      )
    );
    setContentView(rootView);
    wallpapers = new WallpaperStore(this);
    appUpdater = new AppUpdater(this, net);
    // The launch check finishes after the page has painted, so the badge
    // cannot be there at first render. Rather than have the page ask on a
    // timer for a string that changes once, the shell says when it changes.
    appUpdater.setOnUpdateFound(() -> {
      if (webView != null) {
        webView.evaluateJavascript(
          "window.dispatchEvent(new Event('neo-update-available'))", null);
      }
    });
    appUpdater.setOnProgress(percent -> {
      if (webView != null) {
        webView.evaluateJavascript(
          "window.dispatchEvent(new CustomEvent('neo-update-progress',"
            + "{detail:{percent:" + percent + "}}))", null);
      }
    });
    // Hold the system splash screen until the interface has something to show.
    // Without this it lifts as soon as the activity can draw — which is before
    // the WebView has loaded, so the wallpaper appeared bare for a second or
    // two before the calendar arrived on top of it.
    rootView.getViewTreeObserver().addOnPreDrawListener(
      new android.view.ViewTreeObserver.OnPreDrawListener() {
        @Override public boolean onPreDraw() {
          if (!interfaceReady) return false;
          rootView.getViewTreeObserver().removeOnPreDrawListener(this);
          return true;
        }
      }
    );

    // A safety net: an interface that never reports itself ready must not leave
    // the user staring at a splash screen for good.
    rootView.postDelayed(this::markInterfaceReady, SPLASH_TIMEOUT_MS);

    rootView.setOnApplyWindowInsetsListener((view, insets) -> {
      int topPhysical;
      int rightPhysical;
      int bottomPhysical;
      int leftPhysical;

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        android.graphics.Insets topInsets = insets.getInsets(
          android.view.WindowInsets.Type.statusBars() |
            android.view.WindowInsets.Type.displayCutout()
        );
        android.graphics.Insets navigationInsets = insets.getInsets(
          android.view.WindowInsets.Type.navigationBars()
        );
        topPhysical = topInsets.top;
        leftPhysical = Math.max(topInsets.left, navigationInsets.left);
        rightPhysical = Math.max(topInsets.right, navigationInsets.right);
        bottomPhysical = navigationInsets.bottom;
      } else {
        topPhysical = insets.getSystemWindowInsetTop();
        rightPhysical = insets.getSystemWindowInsetRight();
        bottomPhysical = insets.getSystemWindowInsetBottom();
        leftPhysical = insets.getSystemWindowInsetLeft();
      }

      float density = Math.max(1.0f, getResources().getDisplayMetrics().density);
      neoInsetTop = Math.max(0, Math.round(topPhysical / density));
      neoInsetRight = Math.max(0, Math.round(rightPhysical / density));
      neoInsetBottom = Math.max(0, Math.round(bottomPhysical / density));
      neoInsetLeft = Math.max(0, Math.round(leftPhysical / density));

      applyNeoCalendarRootBounds();
      Log.i(
        TAG,
        "Applied root bounds: left=" + neoInsetLeft +
          " top=" + neoInsetTop +
          " right=" + neoInsetRight +
          " bottom=" + neoInsetBottom +
          " density=" + density
      );
      return insets;
    });
    rootView.post(rootView::requestApplyInsets);

    WebSettings settings = webView.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    settings.setAllowFileAccess(false);
    settings.setAllowContentAccess(true);
    settings.setAllowFileAccessFromFileURLs(false);
    settings.setAllowUniversalAccessFromFileURLs(false);
    settings.setMediaPlaybackRequiresUserGesture(false);
    settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    /*
     * Safe Browsing eteint, et ce n'est pas un renoncement.
     *
     * Il compare les URL visitees a une liste tenue par Google, ce qui suppose
     * d'aller la chercher — un aller-retour reseau au demarrage de la WebView.
     * Or cette WebView ne visite rien : tout ce qu'elle charge vient de
     * `shouldInterceptRequest`, donc des assets ou du dossier de donnees, et le
     * moindre lien externe part au navigateur du systeme par
     * `shouldOverrideUrlLoading`. Il n'y a aucune URL a verifier, et donc rien
     * a gagner contre du temps de lancement paye a chaque ouverture.
     */
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      settings.setSafeBrowsingEnabled(false);
    }

    WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
    webView.addJavascriptInterface(new Bridge(), "NeoAndroid");

    webView.setWebChromeClient(new WebChromeClient() {
      @Override public boolean onConsoleMessage(ConsoleMessage message) {
        Log.d(TAG, "JS " + message.messageLevel() + ": " + message.message() +
          " (" + message.sourceId() + ":" + message.lineNumber() + ")");
        return true;
      }
    });

    webView.setWebViewClient(new WebViewClient() {
      @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        return serveBundledAsset(request.getUrl());
      }

      @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        Uri uri = request.getUrl();
        if (isBundledUrl(uri)) return false;
        try {
          startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (Exception error) {
          Log.e(TAG, "Impossible douvrir le lien externe: " + uri, error);
        }
        return true;
      }

      @Override public void onPageFinished(WebView view, String url) {
        super.onPageFinished(view, url);
        Log.i(TAG, "Interface chargee: " + url);
        applyNeoCalendarRootBounds();
        webView.postDelayed(MainActivity.this::applyNeoCalendarRootBounds, 250);
      }

      @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
        super.onReceivedError(view, request, error);
        if (request.isForMainFrame()) {
          Log.e(TAG, "Erreur WebView principale: " + error);
        }
      }
    });

    webView.loadUrl(APP_URL);
    routeFromIntent(getIntent());
    consumeUpdateRetry(getIntent());
    requestNotificationPermission();
  }

  private void applyNeoCalendarRootBounds() {
    if (webView == null) return;

    final String javascript =
      "(function(){" +
      "var html=document.documentElement;" +
      "var body=document.body;" +
      "var root=document.getElementById('root');" +
      "if(!html||!body||!root){return false;}" +
      "var top='" + neoInsetTop + "px';" +
      "var right='" + neoInsetRight + "px';" +
      "var bottom='" + neoInsetBottom + "px';" +
      "var left='" + neoInsetLeft + "px';" +
      "var nodes=[html,body,root];" +
      "for(var i=0;i<nodes.length;i++){" +
      "var node=nodes[i];" +
      "node.style.setProperty('--nc-native-root-top',top);" +
      "node.style.setProperty('--nc-native-root-right',right);" +
      "node.style.setProperty('--nc-native-root-bottom',bottom);" +
      "node.style.setProperty('--nc-native-root-left',left);" +
      "node.style.setProperty('--nc-android-inset-top',top);" +
      "node.style.setProperty('--nc-android-inset-right',right);" +
      "node.style.setProperty('--nc-android-inset-bottom',bottom);" +
      "node.style.setProperty('--nc-android-inset-left',left);" +
      "node.style.setProperty('--nc-final-safe-top',top);" +
      "node.style.setProperty('--nc-final-safe-right',right);" +
      "node.style.setProperty('--nc-final-safe-bottom',bottom);" +
      "node.style.setProperty('--nc-final-safe-left',left);" +
      "node.style.setProperty('box-sizing','border-box','important');" +
      "node.style.setProperty('width','100%','important');" +
      "node.style.setProperty('height','100%','important');" +
      "node.style.setProperty('min-height','100%','important');" +
      "node.style.setProperty('margin','0','important');" +
      "}" +
      "html.style.setProperty('overflow','hidden','important');" +
      "body.style.setProperty('overflow','hidden','important');" +
      "root.style.setProperty('position','fixed','important');" +
      "root.style.setProperty('top','0','important');" +
      "root.style.setProperty('right','0','important');" +
      "root.style.setProperty('bottom','0','important');" +
      "root.style.setProperty('left','0','important');" +
      "root.style.setProperty('max-width','none','important');" +
      "root.style.setProperty('max-height','none','important');" +
      "root.style.setProperty('padding','0','important');" +
      "root.style.setProperty('overflow','hidden','important');" +
      "body.classList.add('nc-native-fullscreen-v6');" +
      "window.dispatchEvent(new CustomEvent('neo-calendar-insets-changed'));" +
      "return true;" +
      "})();";

    webView.post(() -> webView.evaluateJavascript(javascript, null));
  }

  private boolean isBundledUrl(Uri uri) {
    return uri != null
      && "https".equalsIgnoreCase(uri.getScheme())
      && APP_HOST.equalsIgnoreCase(uri.getHost());
  }

  private WebResourceResponse serveBundledAsset(Uri uri) {
    if (!isBundledUrl(uri)) return null;

    String assetPath = uri.getPath();
    if (assetPath == null || assetPath.isEmpty() || "/".equals(assetPath)) {
      assetPath = "index.html";
    } else {
      assetPath = assetPath.substring(1);
    }

    // Les fonds d'ecran ne sont plus dans l'APK : ils vivent dans le dossier de
    // donnees, telecharges une fois et gardes ensuite. On les y cherche AVANT
    // les assets — ce qui laisse une version encore embarquee fonctionner, et
    // fait qu'un fond absent renvoie 404, signal que la page attend pour
    // proposer de le telecharger.
    if (assetPath.startsWith("themes/neo-wallpapers/")
        && !assetPath.contains("/thumbs/")) {
      String name = assetPath.substring(assetPath.lastIndexOf('/') + 1);
      InputStream stored = wallpapers == null ? null : wallpapers.open(name);
      if (stored != null) {
        Map<String, String> headers = new HashMap<>();
        headers.put("Access-Control-Allow-Origin", "*");
        // Une image telechargee ne change plus : la relire a chaque peinture du
        // fond serait un aller-retour SAF pour rien.
        headers.put("Cache-Control", "max-age=31536000, immutable");
        return new WebResourceResponse("image/jpeg", null, 200, "OK", headers, stored);
      }
    }

    try {
      InputStream stream = getAssets().open(assetPath);
      Map<String, String> headers = new HashMap<>();
      headers.put("Access-Control-Allow-Origin", "*");
      headers.put("Cache-Control", "no-cache");
      return new WebResourceResponse(
        mimeType(assetPath),
        isTextAsset(assetPath) ? "UTF-8" : null,
        200,
        "OK",
        headers,
        stream
      );
    } catch (IOException error) {
      Log.e(TAG, "Asset Android introuvable: " + assetPath, error);
      byte[] body = ("Asset introuvable: " + assetPath).getBytes(StandardCharsets.UTF_8);
      return new WebResourceResponse(
        "text/plain",
        "UTF-8",
        404,
        "Not Found",
        Collections.emptyMap(),
        new ByteArrayInputStream(body)
      );
    }
  }

  private boolean isTextAsset(String path) {
    String value = path.toLowerCase(Locale.ROOT);
    return value.endsWith(".html") || value.endsWith(".js") || value.endsWith(".mjs")
      || value.endsWith(".css") || value.endsWith(".json") || value.endsWith(".svg")
      || value.endsWith(".txt") || value.endsWith(".map");
  }

  private String mimeType(String path) {
    String value = path.toLowerCase(Locale.ROOT);
    if (value.endsWith(".html")) return "text/html";
    if (value.endsWith(".js") || value.endsWith(".mjs")) return "application/javascript";
    if (value.endsWith(".css")) return "text/css";
    if (value.endsWith(".json") || value.endsWith(".map")) return "application/json";
    if (value.endsWith(".svg")) return "image/svg+xml";
    if (value.endsWith(".png")) return "image/png";
    if (value.endsWith(".jpg") || value.endsWith(".jpeg")) return "image/jpeg";
    if (value.endsWith(".webp")) return "image/webp";
    if (value.endsWith(".woff")) return "font/woff";
    if (value.endsWith(".woff2")) return "font/woff2";
    if (value.endsWith(".ttf")) return "font/ttf";
    return "application/octet-stream";
  }

  @Override public void onBackPressed(){
    if(webView==null){super.onBackPressed();return;}
    webView.evaluateJavascript(
      "window.__neoAndroidBack ? window.__neoAndroidBack() : false",
      handled->{
        if("true".equals(handled))return;
        if(webView.canGoBack())webView.goBack();
        else MainActivity.super.onBackPressed();
      }
    );
  }
  /* Poser ce qui attendait, et regarder s'il y a du neuf. Les deux vont
     ensemble : revenir sur l'application est le moment ou l'on s'attend a ce
     qu'elle se soit tenue au courant, et c'est ce qui remplace le geste
     d'aller chercher soi-meme. */
  @Override protected void onResume() {
    super.onResume();
    if (appUpdater == null) return;
    appUpdater.resumePendingInstall();
    if (interfaceReady) appUpdater.checkOnResume();
  }
  @Override protected void onDestroy(){io.shutdownNow();if(webView!=null){webView.removeJavascriptInterface("NeoAndroid");webView.destroy();}super.onDestroy();}
  @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);String id=pendingPickerId;pendingPickerId=null;if(id==null)return;if(result!=RESULT_OK||data==null){resolve(id,true,"null");return;}try{if(request==PICK_TREE){Uri uri=data.getData();if(uri==null){resolve(id,true,"null");return;}int flags=data.getFlags()&(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION);getContentResolver().takePersistableUriPermission(uri,flags);getSharedPreferences(PREF_FILE,MODE_PRIVATE).edit().putString(PREF_TREE,uri.toString()).apply();resolve(id,true,JSONObject.quote(uri.toString()));}else{JSONArray arr=new JSONArray();if(data.getClipData()!=null){for(int i=0;i<data.getClipData().getItemCount();i++)arr.put(data.getClipData().getItemAt(i).getUri().toString());}else if(data.getData()!=null)arr.put(data.getData().toString());resolve(id,true,arr.toString());}}catch(Exception e){resolve(id,false,e.getMessage());}}
  private void resolve(String id,boolean ok,String payload){String safeId=JSONObject.quote(id), safePayload=JSONObject.quote(payload==null?"":payload);runOnUiThread(()->webView.evaluateJavascript("window.__neoAndroidResolve&&window.__neoAndroidResolve("+safeId+","+ok+","+safePayload+")",null));}

  /**
   * Passes a widget tap to the page.
   *
   * A tap can arrive before there is a page to tell — the widget starts the app
   * from cold — so the route is held until the interface says it is ready, and
   * delivered then. Anything else drops the very taps that matter most.
   */
  /**
   * Asks once for the right to post notifications.
   *
   * Below Android 13 there is nothing to ask: the permission did not exist and
   * posting was allowed outright. Above it, a refusal is final and silent —
   * reminders are simply scheduled and never seen, which is why the settings
   * say so rather than letting it look broken.
   */
  private void requestNotificationPermission() {
    if (android.os.Build.VERSION.SDK_INT < 33) return;
    if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
        == android.content.pm.PackageManager.PERMISSION_GRANTED) {
      return;
    }
    requestPermissions(
        new String[] {android.Manifest.permission.POST_NOTIFICATIONS}, 42);
  }

  /** Reprendre une mise a jour depuis la notification.
   *
   *  Le telechargement a besoin de l'updater, qui a besoin de l'Activity : c'est
   *  pourquoi l'action ouvre l'app plutot que de partir d'un receveur. Mais elle
   *  la rouvre EN reprenant — un seul appui, et la barre de progression repart —
   *  au lieu de laisser retrouver le bouton. Le drapeau est consomme, sans quoi
   *  une rotation le rejouerait. */
  private void consumeUpdateRetry(Intent intent) {
    if (intent == null || !intent.getBooleanExtra(EXTRA_UPDATE_RETRY, false)) {
      return;
    }
    intent.removeExtra(EXTRA_UPDATE_RETRY);
    if (appUpdater != null) appUpdater.retryLastDownload();
  }

  private void routeFromIntent(Intent intent) {
    if (intent == null) return;
    String route = null;
    if (NeoCalendarWidget.ACTION_NEW_EVENT.equals(intent.getAction())) {
      route = "{\"type\":\"new-event\"}";
    } else {
      String eventId = intent.getStringExtra(EXTRA_EVENT_ID);
      if (eventId != null && !eventId.isEmpty()) {
        route = "{\"type\":\"event\",\"eventId\":" + JSONObject.quote(eventId) + "}";
      }
    }
    if (route == null) return;

    intent.removeExtra(EXTRA_EVENT_ID);
    if (!interfaceReady || webView == null) {
      pendingWidgetRoute = route;
      return;
    }
    deliverWidgetRoute(route);
  }

  private void deliverWidgetRoute(String route) {
    final String javascript =
      "window.dispatchEvent(new CustomEvent('neo-calendar-widget-route',{detail:"
        + route + "}))";
    runOnUiThread(() -> webView.evaluateJavascript(javascript, null));
  }

  @Override protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    consumeUpdateRetry(intent);
    setIntent(intent);
    routeFromIntent(intent);
  }

  private void markInterfaceReady() {
    if (interfaceReady) return;
    interfaceReady = true;
    /* La mise a jour se cherche une fois le calendrier a l'ecran, pas avant.
       Elle n'est jamais urgente, et lancee des `onCreate` elle prenait la
       bande passante d'une connexion faible au moment ou l'abonnement ICS en
       avait besoin. */
    appUpdater.checkOnLaunch();
    if (pendingWidgetRoute != null) {
      String route = pendingWidgetRoute;
      pendingWidgetRoute = null;
      // The page has only just come up; give it a beat to mount its listener.
      webView.postDelayed(() -> deliverWidgetRoute(route), 120);
    }
    // Ask for a fresh frame so the pre-draw listener runs again and lets it
    // through. Nothing else is guaranteed to request one, and a splash screen
    // that never lifts is worse than one that lifts too early.
    if (rootView != null) {
      rootView.invalidate();
      rootView.requestLayout();
    }
  }

  public class Bridge {
    @JavascriptInterface public void interfaceReady() { runOnUiThread(MainActivity.this::markInterfaceReady); }
    /** The version the shell is holding, or "" — what the badge on the menu
        button is drawn from. Returns synchronously: it is a field, not a
        fetch. */
    @JavascriptInterface public String pendingUpdate(){ return AppUpdater.pendingVersion(); }
    /** Poser la mise a jour deja descendue. Rien a retelecharger : elle attend
     *  sur le disque depuis la verification du lancement. */
    @JavascriptInterface public void installPendingUpdate(){ if(appUpdater!=null) appUpdater.installReady(); }
    /** Les fonds deja presents dans le dossier, pour que le selecteur les
        marque au lieu de les reproposer. */
    @JavascriptInterface public String installedWallpapers(){
      JSONArray out = new JSONArray();
      if (wallpapers != null) for (String name : wallpapers.installed()) out.put(name);
      return out.toString();
    }
    /** Telecharge UN fond, verifie son empreinte, l'ecrit dans le dossier, et
        repond a la page par un evenement — le pont ne peut pas rendre un
        resultat asynchrone. */
    @JavascriptInterface public void downloadWallpaper(String name, String url, String sha256){
      net.execute(() -> {
        String error = "";
        try {
          if (wallpapers != null) wallpapers.download(name, url, sha256);
        } catch (Exception failure) {
          error = failure.getMessage() == null ? "failed" : failure.getMessage();
          Log.w(TAG, "Telechargement du fond " + name + " impossible", failure);
        }
        final String status = error;
        runOnUiThread(() -> {
          if (webView == null) return;
          webView.evaluateJavascript(
            "window.dispatchEvent(new CustomEvent('neo-wallpaper-done',{detail:{name:"
              + JSONObject.quote(name) + ",error:" + JSONObject.quote(status) + "}}))",
            null);
        });
      });
    }
    @JavascriptInterface public void pickDirectory(String id){pendingPickerId=id;Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION|Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION|Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);startActivityForResult(i,PICK_TREE);}
    @JavascriptInterface public void pickFiles(String id,boolean multiple){pendingPickerId=id;pendingMultiple=multiple;Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT);i.setType("*/*");i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,multiple);i.addCategory(Intent.CATEGORY_OPENABLE);startActivityForResult(i,PICK_FILES);}
    @JavascriptInterface public void invoke(String id,String command,String args){executorFor(command).execute(()->{try{Object out=handle(command,new JSONObject(args));resolve(id,true,out==null?"null":(out instanceof String?JSONObject.quote((String)out):out.toString()));}catch(Exception e){resolve(id,false,e.getMessage()==null?e.toString():e.getMessage());}});}
  }

  /** Sur quelle file poser une commande du pont : celle du reseau si elle sort
      de l'appareil, celle des fichiers sinon. Le prefixe suffit et vaut pour
      les commandes a venir — c'est la sortie reseau qu'on veut ecarter du fil
      unique, pas une liste de noms a tenir a jour. */
  private ExecutorService executorFor(String command){
    return command.startsWith("fetch_") ? net : io;
  }

  private Uri tree(JSONObject args)throws Exception{String raw=args.optString("dataFolder","");if(raw.isEmpty())raw=getSharedPreferences(PREF_FILE,MODE_PRIVATE).getString(PREF_TREE,"");if(raw.isEmpty())throw new Exception("Selectionnez dabord un dossier Android.");Uri u=Uri.parse(raw);boolean granted=false;for(UriPermission p:getContentResolver().getPersistedUriPermissions())if(p.getUri().equals(u)&&p.isReadPermission()){granted=true;break;}if(!granted)throw new Exception("Lautorisation du dossier a ete revoquee. Selectionnez-le a nouveau.");String id=DocumentsContract.getTreeDocumentId(u);return DocumentsContract.buildDocumentUriUsingTree(u,id);}
  /* L'icone d'une application, dessinee puis encodee : une WebView n'a pas acces
     aux fichiers d'une autre application, il n'y a donc rien a pointer et tout a
     porter. 96 px suffisent a la feuille, qui les affiche a 40. Une icone qui ne
     se dessine pas ne coute que son image : l'entree reste au menu. */
  private String appIcon(PackageManager packages,String pkg){
    try{
      android.graphics.drawable.Drawable icon=packages.getApplicationIcon(pkg);
      int size=96;
      android.graphics.Bitmap bitmap=android.graphics.Bitmap.createBitmap(
        size,size,android.graphics.Bitmap.Config.ARGB_8888);
      android.graphics.Canvas canvas=new android.graphics.Canvas(bitmap);
      icon.setBounds(0,0,size,size);
      icon.draw(canvas);
      ByteArrayOutputStream out=new ByteArrayOutputStream();
      bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,out);
      return "data:image/png;base64,"+Base64.encodeToString(out.toByteArray(),Base64.NO_WRAP);
    }catch(Exception ignored){return null;}
  }

  private Object handle(String c,JSONObject a)throws Exception{
    switch(c){
      case "has_obsidian_config": return false;
      case "load_desktop_workspace": return loadWorkspace(tree(a));
      case "save_desktop_preferences": savePreferences(tree(a),a.get("preferences")); return null;
      case "write_desktop_event_file": return writeEvent(tree(a),a);
      case "delete_desktop_event_file": {Uri u=findPath(tree(a),a.getString("relativePath"));if(u!=null)DocumentsContract.deleteDocument(getContentResolver(),u);return null;}
      case "create_desktop_calendar_folder": return createFolder(tree(a),a.getString("name"));
      /* Chaque lien ICS ecrit ses notes dans un dossier a lui, demande une fois
         par cycle de synchro tant qu'il n'en a pas. Le bureau connait cette
         commande depuis la 1.57.3 ; ici elle tombait dans le `default` et levait
         « Commande Android non prise en charge », ce qui faisait echouer la
         synchro AVANT le telechargement du flux : plus un seul evenement ICS
         sur telephone. */
      case "ensure_desktop_ics_folder": return ensureIcsFolder(tree(a),a.optString("calendarPath",""),a.getString("name"));
      case "rename_desktop_calendar_folder": return renameFolder(tree(a),a.getString("relativePath"),a.getString("newName"));
      case "delete_desktop_calendar_folder": return deleteFolder(tree(a),a.getString("relativePath"));
      case "open_desktop_path": return null;
      /* `targetPackage` vise une application precise. Sans lui, un lien `geo:`
         ferait remonter le selecteur du systeme par-dessus la feuille qu'on
         vient de fermer, et le choix serait a refaire. */
      case "open_desktop_external_target": {
        String target=a.getString("target");
        String pkg=a.optString("targetPackage","");
        runOnUiThread(()->{try{
          Intent view=new Intent(Intent.ACTION_VIEW,Uri.parse(target));
          if(!pkg.isEmpty()) view.setPackage(pkg);
          /* Une tache a elle, et non la notre. Sans ce drapeau la carte
             s'empile SUR Neo Calendar : les deux ne font plus qu'une entree
             dans les recents, et revenir a l'agenda demande de fermer la carte
             d'abord. Avec, chacune vit de son cote et l'on passe de l'une a
             l'autre comme entre deux applications, ce qu'elles sont. */
          view.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
          startActivity(view);
        }catch(Exception ignored){}});
        return null;
      }
      /* Quelles cartes sont installees, pour que le menu du lieu ne propose que
         ce qui s'ouvrira. Android ne le dit pas de lui-meme : il faut demander
         paquet par paquet, et depuis Android 11 la question doit etre declaree
         au manifeste (<queries>), sans quoi le systeme repond « absente » pour
         tout. Les noms courts sont ceux du menu (voir locationLink.ts). */
      case "installed_maps_apps": {
        String[][] known={
          {"google","com.google.android.apps.maps"},
          {"citymapper","com.citymapper.app.release"},
          {"moovit","com.tranzmate"},
          {"waze","com.waze"},
        };
        JSONArray installed=new JSONArray();
        PackageManager packages=getPackageManager();
        Set<String> seen=new HashSet<>();
        for(String[] app:known){
          if(packages.getLaunchIntentForPackage(app[1])==null) continue;
          seen.add(app[1]);
          JSONObject entry=new JSONObject();
          entry.put("id",app[0]);
          entry.put("package",app[1]);
          String icon=appIcon(packages,app[1]);
          if(icon!=null) entry.put("icon",icon);
          installed.put(entry);
        }
        /* Et les autres : celles dont on ignore l'adresse d'itineraire mais
           qu'Android sait capables d'ouvrir un point. On ne tient donc pas de
           liste — Bonjour RATP et les suivantes se signalent elles-memes — et
           on ne leur promet qu'une epingle, seule chose qu'une application
           inconnue sache surement recevoir. */
        Intent probe=new Intent(Intent.ACTION_VIEW,Uri.parse("geo:0,0?q=0,0"));
        for(ResolveInfo found:packages.queryIntentActivities(probe,0)){
          String pkg=found.activityInfo!=null?found.activityInfo.packageName:null;
          if(pkg==null||pkg.equals(getPackageName())||!seen.add(pkg)) continue;
          CharSequence label=found.loadLabel(packages);
          if(label==null||label.length()==0) continue;
          JSONObject entry=new JSONObject();
          entry.put("package",pkg);
          entry.put("label",label.toString());
          String icon=appIcon(packages,pkg);
          if(icon!=null) entry.put("icon",icon);
          installed.put(entry);
        }
        return installed;
      }
      case "open_desktop_linked_path": return null;
      case "discover_desktop_obsidian_vaults": return new JSONArray();
      case "search_desktop_vault_notes": return new JSONArray();
      case "copy_desktop_attachment": return copyAttachment(tree(a),a);
      case "read_desktop_attachment": return readAttachment(tree(a),a.getString("relativePath"));
      case "fetch_desktop_ics": return fetch(a.getString("url"));
      case "fetch_desktop_final_url": return finalUrl(a.getString("url"));
      /* The widget is handed a finished list rather than the calendar itself:
         see WidgetData. Writing it is cheap, so the app may call this on every
         change without thinking about it. */
      /* The phone is handed times and finished sentences: the app knows the
         language, the format and what is worth mentioning, and a reminder has
         to read like the calendar it came from. See ReminderScheduler. */
      case "write_reminders": {
        ReminderScheduler.write(MainActivity.this, a.optString("payload", "[]"));
        return null;
      }
      case "write_widget_events": {
        WidgetData.write(MainActivity.this, a.optString("payload", ""));
        runOnUiThread(() -> NeoCalendarWidget.refreshAll(MainActivity.this));
        return null;
      }
      default: throw new Exception("Commande Android non prise en charge: "+c);
    }
  }
  private JSONObject loadWorkspace(Uri tree)throws Exception{JSONArray calendars=new JSONArray(),events=new JSONArray();List<Doc> children=list(tree);for(Doc d:children)if(d.dir&&!d.name.startsWith(".")){JSONObject cal=new JSONObject().put("relativePath",d.name).put("name",d.name);calendars.put(cal);collectEvents(d.uri,d.name,d.name,events);}if(calendars.length()==0){calendars.put(new JSONObject().put("relativePath","").put("name","Default"));for(Doc f:children)if(!f.dir&&f.name.toLowerCase(Locale.ROOT).endsWith(".md"))events.put(new JSONObject().put("relativePath",f.name).put("calendarPath","").put("fileName",f.name).put("contents",readText(f.uri)));}return new JSONObject().put("calendars",calendars).put("eventFiles",events).put("preferences",readPreferences(tree));}
  /** Toutes les notes d'un calendrier, sous-dossiers compris.
   *
   *  Un calendrier n'est pas plat : depuis la 1.57.3 chaque lien ICS range ses
   *  notes dans un dossier a lui, et le bureau, qui descend l'arborescence
   *  depuis toujours, les lisait pendant que le telephone — qui ne regardait
   *  que les enfants directs — n'en voyait plus une seule. Le calendrier
   *  d'appartenance reste celui du dossier de tete : un sous-dossier organise,
   *  il ne fait pas un calendrier de plus. */
  private void collectEvents(Uri directory,String calendarPath,String relativePrefix,JSONArray out)throws Exception{
    for(Doc f:list(directory)){
      if(f.dir){
        if(f.name.startsWith("."))continue;
        collectEvents(f.uri,calendarPath,relativePrefix+"/"+f.name,out);
        continue;
      }
      if(!f.name.toLowerCase(Locale.ROOT).endsWith(".md"))continue;
      out.put(new JSONObject()
        .put("relativePath",relativePrefix+"/"+f.name)
        .put("calendarPath",calendarPath)
        .put("fileName",f.name)
        .put("contents",readText(f.uri)));
    }
  }
  /** Missing file means first run; an unreadable or corrupt one must fail so the
   *  app never saves its defaults over a healthy configuration. */
  private JSONObject readPreferences(Uri tree)throws Exception{Uri p=findChild(tree,PREFERENCES_FILE_NAME);if(p==null)p=findChild(tree,LEGACY_PREFERENCES_FILE_NAME);if(p==null)return new JSONObject();String raw=readText(p);if(raw.trim().isEmpty())return new JSONObject();try{return new JSONObject(raw);}catch(JSONException e){throw new Exception("Le fichier de preferences est illisible: "+e.getMessage());}}
  private void savePreferences(Uri tree,Object preferences)throws Exception{writeText(findOrCreate(tree,PREFERENCES_FILE_NAME,"application/json"),(preferences instanceof JSONObject?((JSONObject)preferences).toString(2):String.valueOf(preferences))+"\n");Uri legacy=findChild(tree,LEGACY_PREFERENCES_FILE_NAME);if(legacy!=null)DocumentsContract.deleteDocument(getContentResolver(),legacy);}
  /** Writes an event file, moving it when its calendar changed.
   *
   *  DocumentsContract.renameDocument only renames INSIDE a folder — it cannot
   *  move. Using it for a calendar change left the original file behind (under
   *  a " (1)" name, since the rename collided with itself) while a copy was
   *  created in the target folder, so the event showed up twice on the next
   *  launch. A cross-folder change now writes the new file first and deletes
   *  the old one after: an interruption leaves a duplicate, never a loss. */
  private String writeEvent(Uri tree,JSONObject a)throws Exception{
    String cal=a.optString("calendarPath","");
    Uri dir=cal.isEmpty()?tree:findPath(tree,cal);
    if(dir==null)throw new Exception("Calendrier introuvable: "+cal);
    String name=validName(a.getString("fileName"),true);
    String previous=a.optString("previousRelativePath","");
    Uri old=previous.isEmpty()?null:findPath(tree,previous);
    String previousCal=previous.contains("/")?previous.substring(0,previous.lastIndexOf('/')):"";
    boolean sameFolder=old!=null&&previousCal.equals(cal);
    Uri target=findChild(dir,name);

    if(sameFolder){
      if(target!=null&&target.equals(old)){writeText(old,a.getString("contents"));return cal.isEmpty()?name:cal+"/"+name;}
      if(target!=null)name=uniqueName(dir,name);
      Uri renamed=DocumentsContract.renameDocument(getContentResolver(),old,name);
      if(renamed==null)throw new IOException("Renommage impossible");
      writeText(renamed,a.getString("contents"));
      return cal.isEmpty()?name:cal+"/"+name;
    }

    if(target!=null&&old==null){writeText(target,a.getString("contents"));return cal.isEmpty()?name:cal+"/"+name;}
    if(target!=null)name=uniqueName(dir,name);
    Uri created=DocumentsContract.createDocument(getContentResolver(),dir,"text/markdown",name);
    if(created==null)throw new IOException("Creation impossible: "+name);
    writeText(created,a.getString("contents"));
    if(old!=null)DocumentsContract.deleteDocument(getContentResolver(),old);
    return cal.isEmpty()?name:cal+"/"+name;
  }
  private String createFolder(Uri tree,String name)throws Exception{name=validName(name,false);if(findChild(tree,name)!=null)throw new Exception("Un dossier portant ce nom existe deja.");DocumentsContract.createDocument(getContentResolver(),tree,DocumentsContract.Document.MIME_TYPE_DIR,name);return name;}
  /** Le dossier d'un lien ICS, cree au besoin.
   *
   *  Appelable a chaque cycle de synchro : un dossier deja la est rendu tel
   *  quel. Renvoie le chemin relatif a la racine, forme que le planificateur
   *  ecrit ensuite dans `calendarPath` — la meme que rend la commande du
   *  bureau, sans quoi les notes du telephone et celles de l'ordinateur
   *  n'atterriraient pas au meme endroit. */
  private String ensureIcsFolder(Uri tree,String calendarPath,String name)throws Exception{
    name=validName(name,false);
    Uri parent=calendarPath.isEmpty()?tree:findPath(tree,calendarPath);
    if(parent==null)throw new Exception("Calendrier introuvable: "+calendarPath);
    for(Doc d:list(parent))if(d.name.equals(name)){
      if(!d.dir)throw new Exception("« "+name+" » existe deja et n'est pas un dossier.");
      return calendarPath.isEmpty()?name:calendarPath+"/"+name;
    }
    if(DocumentsContract.createDocument(getContentResolver(),parent,DocumentsContract.Document.MIME_TYPE_DIR,name)==null)
      throw new IOException("Creation du dossier impossible: "+name);
    return calendarPath.isEmpty()?name:calendarPath+"/"+name;
  }
  private String renameFolder(Uri tree,String rel,String name)throws Exception{name=validName(name,false);Uri u=findPath(tree,rel);if(u==null)throw new Exception("Calendrier introuvable.");if(findChild(tree,name)!=null)throw new Exception("Un dossier portant ce nom existe deja.");DocumentsContract.renameDocument(getContentResolver(),u,name);return name;}
  private Object deleteFolder(Uri tree,String rel)throws Exception{Uri u=findPath(tree,rel);if(u==null)return null;if(!list(u).isEmpty())throw new Exception("Ce calendrier nest pas vide.");DocumentsContract.deleteDocument(getContentResolver(),u);return null;}
  private JSONObject copyAttachment(Uri tree,JSONObject a)throws Exception{Uri src=Uri.parse(a.getString("sourcePath"));String event=a.getString("eventRelativePath");String base=event.contains("/")?event.substring(0,event.lastIndexOf('/')):"";Uri dir=base.isEmpty()?tree:findPath(tree,base);/* Le point compte : loadWorkspace prend tout dossier qui n'en porte pas
       pour un calendrier. Un evenement pose a la racine du dossier de donnees
       se voyait donc creer un calendrier nomme "attachments" a cote de lui —
       et des qu'un calendrier existe, les notes de la racine ne sont plus
       lues du tout : le calendrier se vidait en attachant un fichier. Le
       bureau ecrit ".attachments" depuis toujours, pour cette raison. */
    Uri attach=findChild(dir,".attachments");if(attach==null)attach=findChild(dir,"attachments");if(attach==null)attach=DocumentsContract.createDocument(getContentResolver(),dir,DocumentsContract.Document.MIME_TYPE_DIR,".attachments");String name=queryName(src);if(name==null||name.isBlank())name="attachment";name=uniqueName(attach,name);Uri dst=DocumentsContract.createDocument(getContentResolver(),attach,getContentResolver().getType(src)==null?"application/octet-stream":getContentResolver().getType(src),name);try(InputStream in=getContentResolver().openInputStream(src);OutputStream out=getContentResolver().openOutputStream(dst,"w")){byte[] b=new byte[8192];int n;while((n=in.read(b))>0)out.write(b,0,n);}String rel=(base.isEmpty()?"":base+"/")+queryName(attach)+"/"+name;return new JSONObject().put("fileName",name).put("relativePath",rel).put("markdownPath",rel);}
  /** Ce qu'une piece jointe peut peser avant qu'on refuse de la porter en
   *  memoire : la vignette voyage encodee en texte a travers le pont. */
  private static final long ATTACHMENT_PREVIEW_LIMIT = 8L * 1024 * 1024;
  /** Le contenu d'une piece jointe, en base64, pour que la WebView la montre.
   *
   *  Elle ne peut pas ouvrir un `content://` : il est delivre a l'application,
   *  pas a la page. Le fichier traverse donc le pont, un a la fois, et
   *  seulement s'il se trouve bien dans le dossier choisi. */
  private String readAttachment(Uri tree,String relativePath)throws Exception{
    Uri file=findPath(tree,relativePath);
    if(file==null)throw new Exception("Piece jointe introuvable: "+relativePath);
    try(InputStream in=getContentResolver().openInputStream(file)){
      if(in==null)throw new IOException("Lecture impossible");
      byte[] bytes=readAll(in);
      if(bytes.length>ATTACHMENT_PREVIEW_LIMIT)throw new Exception("Piece jointe trop lourde pour un apercu");
      return Base64.encodeToString(bytes,Base64.NO_WRAP);
    }
  }
  private String fetch(String value)throws Exception{HttpURLConnection h=(HttpURLConnection)new URL(value).openConnection();h.setConnectTimeout(15000);h.setReadTimeout(20000);try(InputStream in=h.getInputStream()){return new String(readAll(in),StandardCharsets.UTF_8);}finally{h.disconnect();}}
  /**
   * Ou mene vraiment un lien de partage.
   *
   * `vm.tiktok.com/ZN88…` est un billet indiquant une adresse, pas l'adresse.
   * L'application cherchait celle-ci DANS la page — `og:url` —, ce qui suppose
   * que le site serve une vraie page a un client HTTP ordinaire ; TikTok lui
   * sert sa porte d'entree, dont l'adresse canonique est sa page d'accueil. La
   * redirection, elle, mene bien a la video, et il suffit de la suivre et de
   * regarder ou l'on a atterri. C'est ce que le site publie pour ca, et ca ne
   * demande de se faire passer pour personne.
   *
   * Le corps n'est pas lu : seule la destination compte ici.
   */
  private String finalUrl(String value)throws Exception{
    String normalized=value.trim();
    if(!(normalized.startsWith("https://")||normalized.startsWith("http://")))
      throw new Exception("Adresse non supportee: "+value);
    HttpURLConnection h=(HttpURLConnection)new URL(normalized).openConnection();
    h.setConnectTimeout(6000);
    h.setReadTimeout(6000);
    h.setInstanceFollowRedirects(true);
    try{h.getResponseCode();return h.getURL().toString();}finally{h.disconnect();}
  }

  private String validName(String name,boolean md)throws Exception{name=name.trim();if(name.isEmpty()||name.equals(".")||name.equals("..")||name.contains("/")||name.contains("\\"))throw new Exception("Nom invalide: "+name);if(md&&!name.toLowerCase(Locale.ROOT).endsWith(".md"))throw new Exception("Le fichier doit finir par .md");return name;}
  private String uniqueName(Uri dir,String name)throws Exception{if(findChild(dir,name)==null)return name;int dot=name.lastIndexOf('.');String stem=dot>0?name.substring(0,dot):name,ext=dot>0?name.substring(dot):"";for(int i=1;;i++){String n=stem+" ("+i+")"+ext;if(findChild(dir,n)==null)return n;}}
  private Uri findOrCreate(Uri dir,String name,String mime)throws Exception{Uri u=findChild(dir,name);return u!=null?u:DocumentsContract.createDocument(getContentResolver(),dir,mime,name);}
  private Uri findPath(Uri tree,String rel)throws Exception{Uri cur=tree;for(String part:rel.replace('\\','/').split("/")){if(part.isEmpty()||part.equals("."))continue;if(part.equals(".."))throw new Exception("Chemin invalide");cur=findChild(cur,part);if(cur==null)return null;}return cur;}
  private Uri findChild(Uri parent,String name)throws Exception{for(Doc d:list(parent))if(d.name.equals(name))return d.uri;return null;}
  private static class Doc{Uri uri;String name;boolean dir;Doc(Uri u,String n,boolean d){uri=u;name=n;dir=d;}}
  private List<Doc> list(Uri parent)throws Exception{List<Doc> out=new ArrayList<>();String docId=DocumentsContract.getDocumentId(parent);Uri children=DocumentsContract.buildChildDocumentsUriUsingTree(parent,docId);try(Cursor c=getContentResolver().query(children,new String[]{DocumentsContract.Document.COLUMN_DOCUMENT_ID,DocumentsContract.Document.COLUMN_DISPLAY_NAME,DocumentsContract.Document.COLUMN_MIME_TYPE},null,null,null)){if(c!=null)while(c.moveToNext()){String id=c.getString(0),name=c.getString(1),mime=c.getString(2);Uri u=DocumentsContract.buildDocumentUriUsingTree(parent,id);out.add(new Doc(u,name,DocumentsContract.Document.MIME_TYPE_DIR.equals(mime)));}}out.sort(Comparator.comparing(d->d.name.toLowerCase(Locale.ROOT)));return out;}
  private String readText(Uri u)throws Exception{try(InputStream in=getContentResolver().openInputStream(u)){if(in==null)throw new IOException("Lecture impossible");return new String(readAll(in),StandardCharsets.UTF_8);}}
  private void writeText(Uri u,String text)throws Exception{try(OutputStream out=getContentResolver().openOutputStream(u,"wt")){if(out==null)throw new IOException("Ecriture impossible");out.write(text.getBytes(StandardCharsets.UTF_8));}}
  private byte[] readAll(InputStream in)throws IOException{ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] b=new byte[8192];int n;while((n=in.read(b))!=-1)out.write(b,0,n);return out.toByteArray();}
  private String queryName(Uri u){try(Cursor c=getContentResolver().query(u,new String[]{DocumentsContract.Document.COLUMN_DISPLAY_NAME},null,null,null)){return c!=null&&c.moveToFirst()?c.getString(0):null;}catch(Exception e){return null;}}
}
