package com.ahmed.neocalendar;

import android.content.ContentResolver;
import android.content.Context;
import android.content.UriPermission;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.util.Log;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import javax.net.ssl.HttpsURLConnection;

/**
 * Les fonds d'ecran, dans le dossier de donnees plutot que dans l'APK.
 *
 * Dix megaoctets de photographies representaient 72% de chaque mise a jour,
 * pour des fichiers qui ne changent jamais. Ils vivent maintenant dans
 * `.neo-calendar/wallpapers/` du dossier choisi : telecharges une fois, gardes
 * ensuite. Ce dossier appartient a l'utilisateur, pas a l'application — il
 * survit donc a une desinstallation et a toutes les mises a jour, ce qui est
 * exactement le but.
 *
 * Un fond est telecharge quand il est CHOISI, jamais en lot : a cent images le
 * lot ferait quarante megaoctets pour en utiliser une.
 */
final class WallpaperStore {
  private static final String TAG = "NeoCalendarWallpaper";
  private static final String PREF_FILE = "neo_android";
  private static final String PREF_TREE = "tree_uri";
  /** Le point de depart : cache par convention sous Unix, et range aupres des
      autres donnees de l'app plutot qu'en vrac dans le dossier de l'utilisateur. */
  private static final String FOLDER = ".neo-calendar";
  private static final String SUBFOLDER = "wallpapers";
  private static final String MIME = "image/jpeg";
  private static final long MAX_BYTES = 40L * 1024L * 1024L;

  private final Context context;

  WallpaperStore(Context context) {
    this.context = context;
  }

  // ── Le dossier ────────────────────────────────────────────

  /** Le dossier racine choisi par l'utilisateur, ou null s'il n'y en a pas
      encore — auquel cas il n'y a nulle part ou ranger quoi que ce soit. */
  private Uri root() {
    String raw = context
      .getSharedPreferences(PREF_FILE, Context.MODE_PRIVATE)
      .getString(PREF_TREE, "");
    if (raw.isEmpty()) return null;
    Uri tree = Uri.parse(raw);
    boolean granted = false;
    for (UriPermission permission :
        context.getContentResolver().getPersistedUriPermissions()) {
      if (permission.getUri().equals(tree) && permission.isReadPermission()) {
        granted = true;
        break;
      }
    }
    if (!granted) return null;
    return DocumentsContract.buildDocumentUriUsingTree(
      tree, DocumentsContract.getTreeDocumentId(tree));
  }

  /** L'enfant portant ce nom, ou null. Une requete sur les enfants plutot qu'un
      chemin construit a la main : l'identifiant d'un document n'est pas un
      chemin, et le deviner marche sur un fournisseur et pas sur le suivant. */
  private Uri child(Uri parent, String name) {
    ContentResolver resolver = context.getContentResolver();
    Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(
      parent, DocumentsContract.getDocumentId(parent));
    try (Cursor cursor = resolver.query(
        children,
        new String[] {
          DocumentsContract.Document.COLUMN_DOCUMENT_ID,
          DocumentsContract.Document.COLUMN_DISPLAY_NAME,
        },
        null, null, null)) {
      if (cursor == null) return null;
      while (cursor.moveToNext()) {
        if (name.equals(cursor.getString(1))) {
          return DocumentsContract.buildDocumentUriUsingTree(
            parent, cursor.getString(0));
        }
      }
    } catch (Exception error) {
      Log.w(TAG, "Lecture du dossier impossible", error);
    }
    return null;
  }

  private Uri childFolder(Uri parent, String name, boolean create) {
    Uri existing = child(parent, name);
    if (existing != null || !create) return existing;
    try {
      return DocumentsContract.createDocument(
        context.getContentResolver(),
        parent,
        DocumentsContract.Document.MIME_TYPE_DIR,
        name
      );
    } catch (Exception error) {
      Log.w(TAG, "Creation du dossier " + name + " impossible", error);
      return null;
    }
  }

  /** `.neo-calendar/wallpapers`, cree au besoin. */
  private Uri folder(boolean create) {
    Uri root = root();
    if (root == null) return null;
    Uri neo = childFolder(root, FOLDER, create);
    if (neo == null) return null;
    return childFolder(neo, SUBFOLDER, create);
  }

  // ── Lecture ───────────────────────────────────────────────

  /** Le flux d'un fond deja telecharge, ou null. C'est ce que sert la WebView. */
  InputStream open(String name) {
    try {
      Uri folder = folder(false);
      if (folder == null) return null;
      Uri file = child(folder, name);
      if (file == null) return null;
      return context.getContentResolver().openInputStream(file);
    } catch (Exception error) {
      Log.w(TAG, "Ouverture de " + name + " impossible", error);
      return null;
    }
  }

  /** Les noms deja presents, pour que le selecteur sache quoi marquer. */
  List<String> installed() {
    List<String> names = new ArrayList<>();
    Uri folder = folder(false);
    if (folder == null) return names;
    Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(
      folder, DocumentsContract.getDocumentId(folder));
    try (Cursor cursor = context.getContentResolver().query(
        children,
        new String[] { DocumentsContract.Document.COLUMN_DISPLAY_NAME },
        null, null, null)) {
      if (cursor == null) return names;
      while (cursor.moveToNext()) names.add(cursor.getString(0));
    } catch (Exception error) {
      Log.w(TAG, "Listage impossible", error);
    }
    return names;
  }

  // ── Telechargement ────────────────────────────────────────

  /**
   * Telecharge UN fond et l'ecrit dans le dossier.
   *
   * L'empreinte est verifiee avant que le fichier ne soit publie sous son vrai
   * nom : un octet de travers et rien n'est ecrit, plutot qu'une image a moitie
   * arrivee qui resterait la a faire croire qu'elle est bonne.
   *
   * @throws IOException si le reseau, l'empreinte ou l'ecriture ne suivent pas
   */
  void download(String name, String url, String sha256) throws IOException {
    Uri folder = folder(true);
    if (folder == null) {
      throw new IOException("no-folder");
    }

    byte[] body = fetch(url);
    String actual = hex(MessageDigestSafe.sha256(body));
    if (sha256 != null && !sha256.isEmpty()
        && !actual.equalsIgnoreCase(sha256)) {
      throw new IOException("checksum");
    }

    // Un fichier du meme nom est remplace : re-telecharger doit reparer, pas
    // empiler des « image (1).jpg ».
    Uri existing = child(folder, name);
    if (existing != null) {
      try {
        DocumentsContract.deleteDocument(context.getContentResolver(), existing);
      } catch (Exception ignored) {
        // Le fournisseur refuse la suppression : on ecrira par-dessus.
      }
    }

    Uri file = existing;
    if (child(folder, name) == null) {
      file = DocumentsContract.createDocument(
        context.getContentResolver(), folder, MIME, name);
    }
    if (file == null) throw new IOException("create");

    try (OutputStream out =
        context.getContentResolver().openOutputStream(file, "wt")) {
      if (out == null) throw new IOException("open-write");
      out.write(body);
    }
  }

  private byte[] fetch(String url) throws IOException {
    HttpsURLConnection connection = (HttpsURLConnection) new URL(url).openConnection();
    connection.setConnectTimeout(15_000);
    connection.setReadTimeout(45_000);
    connection.setInstanceFollowRedirects(true);
    try {
      int status = connection.getResponseCode();
      if (status != HttpURLConnection.HTTP_OK) {
        throw new IOException("http-" + status);
      }
      try (InputStream input = connection.getInputStream();
           ByteArrayOutputStream out = new ByteArrayOutputStream()) {
        byte[] buffer = new byte[32 * 1024];
        int count;
        long total = 0;
        while ((count = input.read(buffer)) != -1) {
          total += count;
          if (total > MAX_BYTES) throw new IOException("too-large");
          out.write(buffer, 0, count);
        }
        return out.toByteArray();
      }
    } finally {
      connection.disconnect();
    }
  }

  private static String hex(byte[] bytes) {
    StringBuilder value = new StringBuilder(bytes.length * 2);
    for (byte item : bytes) value.append(String.format(Locale.ROOT, "%02x", item));
    return value.toString();
  }

  /** MessageDigest sans son exception verifiee : SHA-256 existe partout ou
      cette application tourne, et pretendre l'inverse encombre chaque appel. */
  private static final class MessageDigestSafe {
    static byte[] sha256(byte[] body) {
      try {
        return MessageDigest.getInstance("SHA-256").digest(body);
      } catch (Exception impossible) {
        throw new IllegalStateException(impossible);
      }
    }
  }
}
