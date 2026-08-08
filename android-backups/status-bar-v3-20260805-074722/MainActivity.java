package com.ahmed.neocalendar;

import android.app.*;
import android.os.*;
import android.content.*;
import android.database.Cursor;
import android.graphics.Color;
import android.util.Log;
import android.net.Uri;
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
  private final ExecutorService io = Executors.newSingleThreadExecutor();
  private String pendingPickerId;
  private boolean pendingMultiple;
  private static final int PICK_TREE=4101, PICK_FILES=4102;
  private static final String PREF_FILE="neo_android", PREF_TREE="tree_uri";

  @Override public void onCreate(Bundle state) {
    super.onCreate(state);

    // NEO_ANDROID_SYSTEM_INSETS_START
    webView = new WebView(this);
    webView.setBackgroundColor(Color.rgb(17, 17, 27));

    // Android 15+ is edge-to-edge. Padding on a WebView is not reliable for
    // moving its document, so the WebView itself receives real layout margins.
    final android.widget.FrameLayout appRoot = new android.widget.FrameLayout(this);
    appRoot.setBackgroundColor(Color.rgb(17, 17, 27));

    final android.widget.FrameLayout.LayoutParams webLayout =
      new android.widget.FrameLayout.LayoutParams(
        android.view.ViewGroup.LayoutParams.MATCH_PARENT,
        android.view.ViewGroup.LayoutParams.MATCH_PARENT
      );
    appRoot.addView(webView, webLayout);
    setContentView(appRoot);

    final android.view.Window window = getWindow();
    window.setStatusBarColor(Color.rgb(17, 17, 27));
    window.setNavigationBarColor(Color.rgb(17, 17, 27));

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      // We control every inset ourselves so the result is identical on API 30+.
      window.setDecorFitsSystemWindows(false);
      android.view.WindowInsetsController controller = window.getInsetsController();
      if (controller != null) {
        controller.setSystemBarsAppearance(
          0,
          android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS |
            android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
        );
      }
    } else {
      window.getDecorView().setSystemUiVisibility(
        android.view.View.SYSTEM_UI_FLAG_LAYOUT_STABLE |
          android.view.View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
          android.view.View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
      );
    }

    appRoot.setOnApplyWindowInsetsListener((view, insets) -> {
      int topInset = 0;
      int bottomInset = 0;
      int leftInset = 0;
      int rightInset = 0;

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        android.graphics.Insets bars = insets.getInsets(
          android.view.WindowInsets.Type.statusBars() |
            android.view.WindowInsets.Type.navigationBars() |
            android.view.WindowInsets.Type.displayCutout()
        );
        topInset = bars.top;
        bottomInset = bars.bottom;
        leftInset = bars.left;
        rightInset = bars.right;
      } else {
        topInset = insets.getSystemWindowInsetTop();
        bottomInset = insets.getSystemWindowInsetBottom();
        leftInset = insets.getSystemWindowInsetLeft();
        rightInset = insets.getSystemWindowInsetRight();
      }

      // Some preview emulator images can report zero during the first frame.
      int statusBarResource = getResources().getIdentifier(
        "status_bar_height", "dimen", "android"
      );
      int statusBarHeight = statusBarResource > 0
        ? getResources().getDimensionPixelSize(statusBarResource)
        : Math.round(24f * getResources().getDisplayMetrics().density);

      int extraTopSpace = Math.round(
        6f * getResources().getDisplayMetrics().density
      );
      topInset = Math.max(topInset, statusBarHeight) + extraTopSpace;

      android.widget.FrameLayout.LayoutParams params =
        (android.widget.FrameLayout.LayoutParams) webView.getLayoutParams();

      if (
        params.topMargin != topInset ||
        params.bottomMargin != bottomInset ||
        params.leftMargin != leftInset ||
        params.rightMargin != rightInset
      ) {
        params.setMargins(0, 0, 0, 0);
        webView.setLayoutParams(params);
      }

      Log.i(
        TAG,
        "Applied WebView margins: left=" + leftInset +
          " top=" + topInset +
          " right=" + rightInset +
          " bottom=" + bottomInset
      );

      return insets;
    });

    appRoot.post(appRoot::requestApplyInsets);
    // NEO_ANDROID_SYSTEM_INSETS_END

    WebSettings settings = webView.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    settings.setAllowFileAccess(false);
    settings.setAllowContentAccess(true);
    settings.setAllowFileAccessFromFileURLs(false);
    settings.setAllowUniversalAccessFromFileURLs(false);
    settings.setMediaPlaybackRequiresUserGesture(false);
    settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      settings.setSafeBrowsingEnabled(true);
    }

    WebView.setWebContentsDebuggingEnabled(true);
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
          Log.e(TAG, "Impossible d’ouvrir le lien externe: " + uri, error);
        }
        return true;
      }

      @Override public void onPageFinished(WebView view, String url) {
        super.onPageFinished(view, url);
        Log.i(TAG, "Interface chargée: " + url);
      }

      @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
        super.onReceivedError(view, request, error);
        if (request.isForMainFrame()) {
          Log.e(TAG, "Erreur WebView principale: " + error);
        }
      }
    });

    webView.loadUrl(APP_URL);
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

  @Override public void onBackPressed(){if(webView.canGoBack())webView.goBack();else super.onBackPressed();}
  @Override protected void onDestroy(){io.shutdownNow();if(webView!=null){webView.removeJavascriptInterface("NeoAndroid");webView.destroy();}super.onDestroy();}
  @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);String id=pendingPickerId;pendingPickerId=null;if(id==null)return;if(result!=RESULT_OK||data==null){resolve(id,true,"null");return;}try{if(request==PICK_TREE){Uri uri=data.getData();if(uri==null){resolve(id,true,"null");return;}int flags=data.getFlags()&(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION);getContentResolver().takePersistableUriPermission(uri,flags);getSharedPreferences(PREF_FILE,MODE_PRIVATE).edit().putString(PREF_TREE,uri.toString()).apply();resolve(id,true,JSONObject.quote(uri.toString()));}else{JSONArray arr=new JSONArray();if(data.getClipData()!=null){for(int i=0;i<data.getClipData().getItemCount();i++)arr.put(data.getClipData().getItemAt(i).getUri().toString());}else if(data.getData()!=null)arr.put(data.getData().toString());resolve(id,true,arr.toString());}}catch(Exception e){resolve(id,false,e.getMessage());}}
  private void resolve(String id,boolean ok,String payload){String safeId=JSONObject.quote(id), safePayload=JSONObject.quote(payload==null?"":payload);runOnUiThread(()->webView.evaluateJavascript("window.__neoAndroidResolve&&window.__neoAndroidResolve("+safeId+","+ok+","+safePayload+")",null));}

  public class Bridge {
    @JavascriptInterface public void pickDirectory(String id){pendingPickerId=id;Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION|Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION|Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);startActivityForResult(i,PICK_TREE);}
    @JavascriptInterface public void pickFiles(String id,boolean multiple){pendingPickerId=id;pendingMultiple=multiple;Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT);i.setType("*/*");i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,multiple);i.addCategory(Intent.CATEGORY_OPENABLE);startActivityForResult(i,PICK_FILES);}
    @JavascriptInterface public void invoke(String id,String command,String args){io.execute(()->{try{Object out=handle(command,new JSONObject(args));resolve(id,true,out==null?"null":(out instanceof String?JSONObject.quote((String)out):out.toString()));}catch(Exception e){resolve(id,false,e.getMessage()==null?e.toString():e.getMessage());}});}
  }

  private Uri tree(JSONObject args)throws Exception{String raw=args.optString("dataFolder","");if(raw.isEmpty())raw=getSharedPreferences(PREF_FILE,MODE_PRIVATE).getString(PREF_TREE,"");if(raw.isEmpty())throw new Exception("Sélectionnez d’abord un dossier Android.");Uri u=Uri.parse(raw);boolean granted=false;for(UriPermission p:getContentResolver().getPersistedUriPermissions())if(p.getUri().equals(u)&&p.isReadPermission()){granted=true;break;}if(!granted)throw new Exception("L’autorisation du dossier a été révoquée. Sélectionnez-le à nouveau.");String id=DocumentsContract.getTreeDocumentId(u);return DocumentsContract.buildDocumentUriUsingTree(u,id);}
  private Object handle(String c,JSONObject a)throws Exception{
    switch(c){
      case "has_obsidian_config": return false;
      case "load_desktop_workspace": return loadWorkspace(tree(a));
      case "save_desktop_preferences": writeText(findOrCreate(tree(a),".neo-calendar-desktop.json","application/json"),(a.get("preferences") instanceof JSONObject?((JSONObject)a.get("preferences")).toString(2):String.valueOf(a.get("preferences")))+"\n"); return null;
      case "write_desktop_event_file": return writeEvent(tree(a),a);
      case "delete_desktop_event_file": {Uri u=findPath(tree(a),a.getString("relativePath"));if(u!=null)DocumentsContract.deleteDocument(getContentResolver(),u);return null;}
      case "create_desktop_calendar_folder": return createFolder(tree(a),a.getString("name"));
      case "rename_desktop_calendar_folder": return renameFolder(tree(a),a.getString("relativePath"),a.getString("newName"));
      case "delete_desktop_calendar_folder": return deleteFolder(tree(a),a.getString("relativePath"));
      case "open_desktop_path": return null;
      case "open_desktop_external_target": {String target=a.getString("target");runOnUiThread(()->{try{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(target)));}catch(Exception ignored){}});return null;}
      case "open_desktop_linked_path": return null;
      case "discover_desktop_obsidian_vaults": return new JSONArray();
      case "search_desktop_vault_notes": return new JSONArray();
      case "copy_desktop_attachment": return copyAttachment(tree(a),a);
      case "fetch_desktop_ics": return fetch(a.getString("url"));
      default: throw new Exception("Commande Android non prise en charge: "+c);
    }
  }
  private JSONObject loadWorkspace(Uri tree)throws Exception{JSONArray calendars=new JSONArray(),events=new JSONArray();List<Doc> children=list(tree);for(Doc d:children)if(d.dir){JSONObject cal=new JSONObject().put("relativePath",d.name).put("name",d.name);calendars.put(cal);for(Doc f:list(d.uri))if(!f.dir&&f.name.toLowerCase(Locale.ROOT).endsWith(".md"))events.put(new JSONObject().put("relativePath",d.name+"/"+f.name).put("calendarPath",d.name).put("fileName",f.name).put("contents",readText(f.uri)));}if(calendars.length()==0){calendars.put(new JSONObject().put("relativePath","").put("name","Default"));for(Doc f:children)if(!f.dir&&f.name.toLowerCase(Locale.ROOT).endsWith(".md"))events.put(new JSONObject().put("relativePath",f.name).put("calendarPath","").put("fileName",f.name).put("contents",readText(f.uri)));}JSONObject prefs=new JSONObject();Uri p=findChild(tree,".neo-calendar-desktop.json");if(p!=null)try{prefs=new JSONObject(readText(p));}catch(Exception ignored){}return new JSONObject().put("calendars",calendars).put("eventFiles",events).put("preferences",prefs);}
  private String writeEvent(Uri tree,JSONObject a)throws Exception{String cal=a.optString("calendarPath","");Uri dir=cal.isEmpty()?tree:findPath(tree,cal);if(dir==null)throw new Exception("Calendrier introuvable: "+cal);String name=validName(a.getString("fileName"),true);String previous=a.optString("previousRelativePath","");Uri old=previous.isEmpty()?null:findPath(tree,previous);Uri target=findChild(dir,name);if(target!=null&&old!=null&&!target.equals(old))name=uniqueName(dir,name);if(old!=null&&!old.equals(target)){Uri renamed=DocumentsContract.renameDocument(getContentResolver(),old,name);if(renamed==null)throw new IOException("Renommage impossible");target=renamed;}if(target==null)target=DocumentsContract.createDocument(getContentResolver(),dir,"text/markdown",name);writeText(target,a.getString("contents"));return cal.isEmpty()?name:cal+"/"+name;}
  private String createFolder(Uri tree,String name)throws Exception{name=validName(name,false);if(findChild(tree,name)!=null)throw new Exception("Un dossier portant ce nom existe déjà.");DocumentsContract.createDocument(getContentResolver(),tree,DocumentsContract.Document.MIME_TYPE_DIR,name);return name;}
  private String renameFolder(Uri tree,String rel,String name)throws Exception{name=validName(name,false);Uri u=findPath(tree,rel);if(u==null)throw new Exception("Calendrier introuvable.");if(findChild(tree,name)!=null)throw new Exception("Un dossier portant ce nom existe déjà.");DocumentsContract.renameDocument(getContentResolver(),u,name);return name;}
  private Object deleteFolder(Uri tree,String rel)throws Exception{Uri u=findPath(tree,rel);if(u==null)return null;if(!list(u).isEmpty())throw new Exception("Ce calendrier n’est pas vide.");DocumentsContract.deleteDocument(getContentResolver(),u);return null;}
  private JSONObject copyAttachment(Uri tree,JSONObject a)throws Exception{Uri src=Uri.parse(a.getString("sourcePath"));String event=a.getString("eventRelativePath");String base=event.contains("/")?event.substring(0,event.lastIndexOf('/')):"";Uri dir=base.isEmpty()?tree:findPath(tree,base);Uri attach=findChild(dir,"attachments");if(attach==null)attach=DocumentsContract.createDocument(getContentResolver(),dir,DocumentsContract.Document.MIME_TYPE_DIR,"attachments");String name=queryName(src);if(name==null||name.isBlank())name="attachment";name=uniqueName(attach,name);Uri dst=DocumentsContract.createDocument(getContentResolver(),attach,getContentResolver().getType(src)==null?"application/octet-stream":getContentResolver().getType(src),name);try(InputStream in=getContentResolver().openInputStream(src);OutputStream out=getContentResolver().openOutputStream(dst,"w")){byte[] b=new byte[8192];int n;while((n=in.read(b))>0)out.write(b,0,n);}String rel=(base.isEmpty()?"":base+"/")+"attachments/"+name;return new JSONObject().put("fileName",name).put("relativePath",rel).put("markdownPath",rel);}
  private String fetch(String value)throws Exception{HttpURLConnection h=(HttpURLConnection)new URL(value).openConnection();h.setConnectTimeout(15000);h.setReadTimeout(20000);try(InputStream in=h.getInputStream()){return new String(readAll(in),StandardCharsets.UTF_8);}finally{h.disconnect();}}
  private String validName(String name,boolean md)throws Exception{name=name.trim();if(name.isEmpty()||name.equals(".")||name.equals("..")||name.contains("/")||name.contains("\\"))throw new Exception("Nom invalide: "+name);if(md&&!name.toLowerCase(Locale.ROOT).endsWith(".md"))throw new Exception("Le fichier doit finir par .md");return name;}
  private String uniqueName(Uri dir,String name)throws Exception{if(findChild(dir,name)==null)return name;int dot=name.lastIndexOf('.');String stem=dot>0?name.substring(0,dot):name,ext=dot>0?name.substring(dot):"";for(int i=1;;i++){String n=stem+" ("+i+")"+ext;if(findChild(dir,n)==null)return n;}}
  private Uri findOrCreate(Uri dir,String name,String mime)throws Exception{Uri u=findChild(dir,name);return u!=null?u:DocumentsContract.createDocument(getContentResolver(),dir,mime,name);}
  private Uri findPath(Uri tree,String rel)throws Exception{Uri cur=tree;for(String part:rel.replace('\\','/').split("/")){if(part.isEmpty()||part.equals("."))continue;if(part.equals(".."))throw new Exception("Chemin invalide");cur=findChild(cur,part);if(cur==null)return null;}return cur;}
  private Uri findChild(Uri parent,String name)throws Exception{for(Doc d:list(parent))if(d.name.equals(name))return d.uri;return null;}
  private static class Doc{Uri uri;String name;boolean dir;Doc(Uri u,String n,boolean d){uri=u;name=n;dir=d;}}
  private List<Doc> list(Uri parent)throws Exception{List<Doc> out=new ArrayList<>();String docId=DocumentsContract.getDocumentId(parent);Uri children=DocumentsContract.buildChildDocumentsUriUsingTree(parent,docId);try(Cursor c=getContentResolver().query(children,new String[]{DocumentsContract.Document.COLUMN_DOCUMENT_ID,DocumentsContract.Document.COLUMN_DISPLAY_NAME,DocumentsContract.Document.COLUMN_MIME_TYPE},null,null,null)){if(c!=null)while(c.moveToNext()){String id=c.getString(0),name=c.getString(1),mime=c.getString(2);Uri u=DocumentsContract.buildDocumentUriUsingTree(parent,id);out.add(new Doc(u,name,DocumentsContract.Document.MIME_TYPE_DIR.equals(mime)));}}out.sort(Comparator.comparing(d->d.name.toLowerCase(Locale.ROOT)));return out;}
  private String readText(Uri u)throws Exception{try(InputStream in=getContentResolver().openInputStream(u)){if(in==null)throw new IOException("Lecture impossible");return new String(readAll(in),StandardCharsets.UTF_8);}}
  private void writeText(Uri u,String text)throws Exception{try(OutputStream out=getContentResolver().openOutputStream(u,"wt")){if(out==null)throw new IOException("Écriture impossible");out.write(text.getBytes(StandardCharsets.UTF_8));}}
  private byte[] readAll(InputStream in)throws IOException{ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] b=new byte[8192];int n;while((n=in.read(b))!=-1)out.write(b,0,n);return out.toByteArray();}
  private String queryName(Uri u){try(Cursor c=getContentResolver().query(u,new String[]{DocumentsContract.Document.COLUMN_DISPLAY_NAME},null,null,null)){return c!=null&&c.moveToFirst()?c.getString(0):null;}catch(Exception e){return null;}}
}

