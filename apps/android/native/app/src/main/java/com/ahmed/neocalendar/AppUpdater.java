package com.ahmed.neocalendar;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.Icon;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Log;
import android.view.View;
import android.widget.TextView;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutorService;

import javax.net.ssl.HttpsURLConnection;

final class AppUpdater {
  private static final String TAG = "NeoCalendarUpdate";
  private static final String METADATA_URL =
    "https://github.com/ahmed-mili/neo-calendar/releases/latest/download/latest-android.json";
  private static final String EXPECTED_DOWNLOAD_PREFIX =
    "/ahmed-mili/neo-calendar/releases/download/";
  private static final int MAX_METADATA_BYTES = 64 * 1024;
  private static final long MAX_APK_BYTES = 200L * 1024L * 1024L;
  /** The version waved away, for THIS RUN of the app and no longer.
   *
   *  It was written to disk, and that made "Later" a refusal with no way back:
   *  the launch check skipped that version for good, and the only route to it
   *  was knowing that the number beside the gear is secretly a button. One
   *  mis-tap and the update was unreachable to anyone who did not know.
   *
   *  "Later" now means later — the next time the app starts, it asks again.
   *  Static so it survives the Activity being rebuilt (a rotation, a theme
   *  change) without surviving the process, which is exactly what "this run"
   *  means. The old key is left unread rather than migrated; a stale one on
   *  disk simply stops mattering. */
  private static long dismissedThisRun = 0L;
  /** The version found and still not installed, held for the badge.
   *
   *  Static and separate from `dismissedThisRun` on purpose: "Later" puts the
   *  PROMPT away, it does not make the update stop existing. The dot on the
   *  menu button is drawn from this, so it stays until the version that
   *  answers it is running. */
  private static String pendingVersion = "";
  /** La derniere version qu'on a tente de telecharger. Statique comme le
      reste : le bouton « Reessayer » d'une notification peut arriver apres
      que l'Activity a ete reconstruite. */
  private static Metadata lastAttempt;

  /** Read across the bridge by the web side; see appUpdates.ts. */
  static String pendingVersion() {
    return pendingVersion;
  }

  private static final String CHANNEL_ID = "neo_updates";
  private static final int NOTIFICATION_ID = 0x4E43;
  /** A notification redraw costs a binder round trip, and a fast connection
   *  would otherwise ask for one per 32 KB buffer. The bar moves by whole
   *  percents, and never more than five times a second. */
  private static final long PROGRESS_INTERVAL_MS = 200L;
  /** Le manifeste tient en 240 octets ; au-dela de ces delais, la connexion ne
      va pas aboutir utilement. Le telechargement de l'APK garde les siens, plus
      larges : 14 Mo prennent legitimement du temps. */
  private static final int METADATA_CONNECT_MS = 6_000;
  private static final int METADATA_READ_MS = 6_000;

  private final Activity activity;
  private final ExecutorService io;
  private File pendingApk;
  private Runnable onUpdateFound;
  private java.util.function.Consumer<String> onCheckResult;
  private java.util.function.Consumer<Integer> onProgress;

  AppUpdater(Activity activity, ExecutorService io) {
    this.activity = activity;
    this.io = io;
  }

  /** Every launch, with no clock in the way.
   *
   *  There used to be one: a launch that found nothing new put the next check
   *  six hours out, and "Later" put it twenty-four. On a project that ships
   *  several times in an evening that is not a throttle but a blindfold — a
   *  release published an hour after a launch went unseen until the morning,
   *  and the app looked broken while doing exactly what it was told. A check
   *  costs one request for 240 bytes; it can happen every time.
   *
   *  A debug build still says nothing: it is usually newer than anything
   *  published, and the release APK it would offer carries a different signing
   *  certificate anyway. */
  void checkOnLaunch() {
    if (BuildConfig.DEBUG) return;
    io.execute(() -> {
      try {
        Metadata metadata = fetchMetadata();
        if (metadata.versionCode <= currentVersionCode()) return;
        remember(metadata);
        if (metadata.versionCode == dismissedVersionCode()) return;
        activity.runOnUiThread(() -> showPrompt(metadata));
      } catch (Exception error) {
        // Offline, or GitHub having a moment. The next launch asks again.
        Log.w(TAG, "Update check failed", error);
      }
    });
  }

  /** Asked for by hand, from the version beside the gear.
   *
   *  Two things it does that the launch check does not. It ignores the version
   *  the user waved away: pressing the number IS reopening the question, and
   *  answering "nothing new" to someone who just asked would be a lie by
   *  omission. And it says so when there is nothing — a check with no visible
   *  outcome is indistinguishable from a button that does not work. */
  void checkNow() {
    io.execute(() -> {
      try {
        Metadata metadata = fetchMetadata();
        if (metadata.versionCode > currentVersionCode()) {
          remember(metadata);
          activity.runOnUiThread(() -> showPrompt(metadata));
          return;
        }
        pendingVersion = "";
        report("current");
      } catch (Exception error) {
        Log.w(TAG, "Manual update check failed", error);
        // « Hors ligne » et « ca n'a pas marche » ne se corrigent pas de la
        // meme facon : l'un demande du reseau, l'autre demande de reessayer.
        report("offline".equals(error.getMessage()) ? "offline" : "failed");
      }
    });
  }

  /** The answer to a check asked for by hand, handed to the page.
   *
   *  It used to be a Toast: a grey lozenge over the calendar, in the system's
   *  own styling, saying something about a button at the other end of the
   *  screen. The button asked the question, so the button shows the answer —
   *  see the version pill in CalendarSidebar.tsx. */
  private void report(String status) {
    activity.runOnUiThread(() -> {
      if (onCheckResult != null) onCheckResult.accept(status);
    });
  }

  /** Hold the finding, and tell the page so the badge appears now rather than
      at whatever moment it next happens to read. */
  private void remember(Metadata metadata) {
    pendingVersion = metadata.version;
    activity.runOnUiThread(() -> {
      if (onUpdateFound != null) onUpdateFound.run();
    });
  }

  void setOnUpdateFound(Runnable listener) {
    onUpdateFound = listener;
  }

  void setOnCheckResult(java.util.function.Consumer<String> listener) {
    onCheckResult = listener;
  }

  void setOnProgress(java.util.function.Consumer<Integer> listener) {
    onProgress = listener;
  }

  /** Le meme chiffre que la notification, envoye a la page.
   *
   *  -1 quand le serveur n'annonce pas la taille : il n'y a alors pas de
   *  pourcentage honnete a afficher, et la pilule tourne au lieu de compter.
   *  -2 quand c'est fini, dans un sens ou dans l'autre. */
  private void reportProgress(int percent) {
    activity.runOnUiThread(() -> {
      if (onProgress != null) onProgress.accept(percent);
    });
  }

  /** « Reessayer », depuis la notification d'echec.
   *
   *  Un echec de telechargement laissait une notification qu'on pouvait lire et
   *  rien d'autre : la seule issue etait de rouvrir l'app et de retrouver le
   *  bouton. Une notification qui signale un probleme doit porter de quoi le
   *  reprendre. Sans tentative en memoire — le processus est peut-etre reparti
   *  de zero — on refait la verification, qui aboutit au meme endroit. */
  void retryLastDownload() {
    if (lastAttempt != null) {
      download(lastAttempt);
      return;
    }
    checkNow();
  }

  /** Pas de reseau du tout : inutile d'aller au bout d'un delai d'attente pour
   *  apprendre ce que le systeme sait deja. On leve, et l'appelant le dit. */
  private void requireNetwork() throws IOException {
    ConnectivityManager manager =
      activity.getSystemService(ConnectivityManager.class);
    if (manager == null) return;
    Network network = manager.getActiveNetwork();
    NetworkCapabilities capabilities =
      network == null ? null : manager.getNetworkCapabilities(network);
    if (capabilities == null
        || !capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) {
      throw new IOException("offline");
    }
  }

  void resumePendingInstall() {
    if (pendingApk == null || !pendingApk.isFile()) return;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
        && !activity.getPackageManager().canRequestPackageInstalls()) {
      return;
    }
    File apk = pendingApk;
    pendingApk = null;
    launchInstaller(apk);
  }

  /** The app's own sheet, not the platform's grey one.
   *
   *  The window background is cleared to transparent so the rounded card in the
   *  layout is what the eye sees; left to itself the dialog theme paints its own
   *  square panel behind it and the corners come back as grey wedges. */
  private void showPrompt(Metadata metadata) {
    if (activity.isFinishing() || activity.isDestroyed()) return;
    try {
      showStyledPrompt(metadata);
    } catch (Throwable broken) {
      // The styled sheet is the only part of this that can fail on a device
      // and not on a build: an attribute a ROM's theme resolves differently, a
      // drawable it declines to inflate. It also runs on nobody's screen until
      // a version NEWER than the installed one exists — so a fault here would
      // ship quietly and only break the release after it, on every phone at
      // once, at launch. Falling back to the platform's own dialog keeps that
      // failure to what it is: an ugly prompt, not a calendar that cannot open.
      Log.w(TAG, "Styled update prompt failed, falling back", broken);
      showPlainPrompt(metadata);
    }
  }

  private void showPlainPrompt(Metadata metadata) {
    new AlertDialog.Builder(activity)
      .setTitle(R.string.update_available)
      .setMessage(activity.getString(R.string.update_message, metadata.version))
      .setNegativeButton(R.string.update_later,
        (dialog, which) -> dismissVersion(metadata.versionCode))
      .setPositiveButton(R.string.update_install,
        (dialog, which) -> download(metadata))
      .setOnCancelListener(ignored -> dismissVersion(metadata.versionCode))
      .show();
  }

  private void showStyledPrompt(Metadata metadata) {
    View view = activity.getLayoutInflater().inflate(R.layout.update_dialog, null);
    ((TextView) view.findViewById(R.id.update_message))
      .setText(activity.getString(R.string.update_message, metadata.version));

    AlertDialog dialog = new AlertDialog.Builder(activity, R.style.Theme_NeoCalendar_Dialog)
      .setView(view)
      .setCancelable(true)
      .create();
    if (dialog.getWindow() != null) {
      dialog.getWindow().setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
    }

    view.findViewById(R.id.update_later).setOnClickListener(button -> {
      dismissVersion(metadata.versionCode);
      dialog.dismiss();
    });
    view.findViewById(R.id.update_install).setOnClickListener(button -> {
      dialog.dismiss();
      download(metadata);
    });
    // Dismissing by back or by tapping outside is "later" too, and has to be
    // remembered as such — otherwise the prompt returns on the next launch
    // having been answered.
    dialog.setOnCancelListener(ignored -> dismissVersion(metadata.versionCode));
    dialog.show();
  }

  private void download(Metadata metadata) {
    lastAttempt = metadata;
    ensureChannel();
    notifyProgress(metadata, 0, true);
    reportProgress(-1);
    io.execute(() -> {
      try {
        File apk = downloadAndVerify(metadata);
        reportProgress(-2);
        notifyReady(metadata, apk);
        activity.runOnUiThread(() -> requestInstall(apk));
      } catch (Exception error) {
        reportProgress(-2);
        notifyFailed();
        Log.e(TAG, "Update download failed", error);
        activity.runOnUiThread(() ->
          Toast.makeText(activity, R.string.update_failed, Toast.LENGTH_LONG).show()
        );
      }
    });
  }

  private Metadata fetchMetadata() throws Exception {
    requireNetwork();
    URL url = new URL(METADATA_URL);
    // 240 octets. Les delais genereux du telechargement n'ont rien a faire ici :
    // sur une connexion lente ils laissaient la pilule tourner pres d'une minute
    // avant d'admettre que ca n'allait pas aboutir. Mieux vaut echouer vite et
    // le dire — la verification suivante est a un lancement d'ici.
    HttpsURLConnection connection = open(url, METADATA_CONNECT_MS, METADATA_READ_MS);
    try {
      int status = connection.getResponseCode();
      if (status != HttpURLConnection.HTTP_OK) {
        throw new IOException("Update metadata returned HTTP " + status);
      }
      byte[] body = readLimited(connection.getInputStream(), MAX_METADATA_BYTES);
      JSONObject json = new JSONObject(new String(body, StandardCharsets.UTF_8));
      Metadata metadata = new Metadata(
        json.getString("version"),
        json.getLong("versionCode"),
        new URL(json.getString("url")),
        json.getString("sha256").toLowerCase(Locale.ROOT)
      );
      validateMetadata(metadata);
      return metadata;
    } finally {
      connection.disconnect();
    }
  }

  private void validateMetadata(Metadata metadata) throws Exception {
    if (!metadata.version.matches("\\d+\\.\\d+\\.\\d+")) {
      throw new IOException("Invalid update version");
    }
    if (metadata.versionCode <= 0L) {
      throw new IOException("Invalid update version code");
    }
    if (!"https".equalsIgnoreCase(metadata.url.getProtocol())
        || !"github.com".equalsIgnoreCase(metadata.url.getHost())
        || !metadata.url.getPath().startsWith(EXPECTED_DOWNLOAD_PREFIX)) {
      throw new IOException("Update URL is outside the trusted GitHub release path");
    }
    if (!metadata.sha256.matches("[0-9a-f]{64}")) {
      throw new IOException("Invalid update checksum");
    }
  }

  // ── Notifications ─────────────────────────────────────────
  //
  // The download is the one part of this with nothing on screen to show for it:
  // the install prompt only appears at the end, and on a slow connection that is
  // a minute of an app that looks like it did nothing. So it reports the way a
  // store does — one notification, updated in place, that becomes the install
  // button when it is done.

  private void ensureChannel() {
    NotificationManager manager = activity.getSystemService(NotificationManager.class);
    if (manager == null) return;
    // LOW, not DEFAULT: a progress bar that rings is a progress bar nobody
    // wants twice.
    NotificationChannel channel = new NotificationChannel(
      CHANNEL_ID,
      activity.getString(R.string.update_channel),
      NotificationManager.IMPORTANCE_LOW
    );
    channel.setDescription(activity.getString(R.string.update_channel_description));
    channel.setShowBadge(false);
    manager.createNotificationChannel(channel);
  }

  private void notify(Notification notification) {
    NotificationManager manager = activity.getSystemService(NotificationManager.class);
    if (manager == null) return;
    try {
      manager.notify(NOTIFICATION_ID, notification);
    } catch (SecurityException denied) {
      // Notifications refused. The download carries on regardless — the prompt
      // at the end is what actually installs.
      Log.w(TAG, "Update notification refused", denied);
    }
  }

  private void notifyProgress(Metadata metadata, int percent, boolean indeterminate) {
    notify(new Notification.Builder(activity, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_update)
      .setContentTitle(activity.getString(R.string.update_progress_title, metadata.version))
      .setContentText(indeterminate ? null : percent + " %")
      .setProgress(100, percent, indeterminate)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .build());
  }

  /** The finished notification IS the install button, so closing the app
   *  mid-download does not lose the work. The read grant rides on the pending
   *  intent, which is why it can hand a FileProvider URI to the installer. */
  private void notifyReady(Metadata metadata, File apk) {
    PendingIntent install = null;
    try {
      Uri uri = FileProvider.getUriForFile(
        activity, activity.getPackageName() + ".updates", apk);
      install = PendingIntent.getActivity(
        activity,
        0,
        new Intent(Intent.ACTION_VIEW)
          .setDataAndType(uri, "application/vnd.android.package-archive")
          .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK),
        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
      );
    } catch (Exception error) {
      Log.w(TAG, "Cannot build install intent for notification", error);
    }
    Notification.Builder builder = new Notification.Builder(activity, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_update)
      .setContentTitle(activity.getString(R.string.update_ready_title))
      .setContentText(activity.getString(R.string.update_ready_text, metadata.version))
      .setAutoCancel(true)
      .setOngoing(false);
    if (install != null) builder.setContentIntent(install);
    notify(builder.build());
  }

  private void notifyFailed() {
    // L'intention porte l'ordre de reprendre : MainActivity la lit et relance
    // sans que personne ait a retrouver le bouton dans l'app.
    PendingIntent retry = PendingIntent.getActivity(
      activity,
      1,
      new Intent(activity, MainActivity.class)
        .putExtra(MainActivity.EXTRA_UPDATE_RETRY, true)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP),
      PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
    );
    Notification.Builder builder = new Notification.Builder(activity, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_update)
      .setContentTitle(activity.getString(R.string.update_failed_title))
      .setContentText(activity.getString(R.string.update_failed))
      .setAutoCancel(true)
      .setOngoing(false)
      .setContentIntent(retry)
      .addAction(new Notification.Action.Builder(
        Icon.createWithResource(activity, R.drawable.ic_update),
        activity.getString(R.string.update_retry),
        retry
      ).build());
    notify(builder.build());
  }

  private File downloadAndVerify(Metadata metadata) throws Exception {
    File directory = new File(activity.getCacheDir(), "updates");
    if (!directory.isDirectory() && !directory.mkdirs()) {
      throw new IOException("Cannot create update cache");
    }
    File temporary = new File(directory, "neo-calendar-update.apk.part");
    File target = new File(directory, "neo-calendar-update.apk");
    if (temporary.exists() && !temporary.delete()) {
      throw new IOException("Cannot replace partial update");
    }

    HttpsURLConnection connection = open(metadata.url);
    MessageDigest digest = MessageDigest.getInstance("SHA-256");
    long written = 0L;
    try {
      int status = connection.getResponseCode();
      if (status != HttpURLConnection.HTTP_OK) {
        throw new IOException("Update download returned HTTP " + status);
      }
      String finalHost = connection.getURL().getHost().toLowerCase(Locale.ROOT);
      if (!(finalHost.equals("github.com")
          || finalHost.endsWith(".githubusercontent.com"))) {
        throw new IOException("Unexpected update download host");
      }
      long contentLength = connection.getContentLengthLong();
      if (contentLength > MAX_APK_BYTES) {
        throw new IOException("Update is unexpectedly large");
      }
      try (InputStream input = connection.getInputStream();
           FileOutputStream output = new FileOutputStream(temporary)) {
        byte[] buffer = new byte[32 * 1024];
        int count;
        int lastPercent = -1;
        long lastDrawnAt = 0L;
        while ((count = input.read(buffer)) != -1) {
          written += count;
          if (written > MAX_APK_BYTES) throw new IOException("Update is too large");
          digest.update(buffer, 0, count);
          output.write(buffer, 0, count);

          // A server that declines to say how big the file is leaves the bar
          // indeterminate rather than guessing at a total.
          if (contentLength <= 0L) continue;
          int percent = (int) Math.min(100L, written * 100L / contentLength);
          long now = System.currentTimeMillis();
          if (percent == lastPercent || now - lastDrawnAt < PROGRESS_INTERVAL_MS) {
            continue;
          }
          lastPercent = percent;
          lastDrawnAt = now;
          notifyProgress(metadata, percent, false);
          reportProgress(percent);
        }
      }
    } finally {
      connection.disconnect();
    }

    byte[] expected = hex(metadata.sha256);
    if (!MessageDigest.isEqual(expected, digest.digest())) {
      temporary.delete();
      throw new IOException("Update checksum mismatch");
    }
    if (!verifyPackage(temporary, metadata.versionCode)) {
      temporary.delete();
      throw new IOException("Update package identity or signature mismatch");
    }
    if (target.exists() && !target.delete()) {
      throw new IOException("Cannot replace cached update");
    }
    if (!temporary.renameTo(target)) {
      throw new IOException("Cannot finalize cached update");
    }
    return target;
  }

  private boolean verifyPackage(File apk, long expectedVersionCode) throws Exception {
    PackageManager manager = activity.getPackageManager();
    int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
      ? PackageManager.GET_SIGNING_CERTIFICATES
      : PackageManager.GET_SIGNATURES;
    PackageInfo candidate = manager.getPackageArchiveInfo(apk.getAbsolutePath(), flags);
    PackageInfo installed = manager.getPackageInfo(activity.getPackageName(), flags);
    if (candidate == null || !activity.getPackageName().equals(candidate.packageName)) {
      return false;
    }
    long candidateVersion = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
      ? candidate.getLongVersionCode()
      : candidate.versionCode;
    if (candidateVersion != expectedVersionCode || candidateVersion <= currentVersionCode()) {
      return false;
    }
    return certificateDigests(candidate).equals(certificateDigests(installed));
  }

  @SuppressWarnings("deprecation")
  private Set<String> certificateDigests(PackageInfo info) throws Exception {
    Signature[] signatures;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      if (info.signingInfo == null) return new HashSet<>();
      signatures = info.signingInfo.getApkContentsSigners();
    } else {
      signatures = info.signatures;
    }
    Set<String> result = new HashSet<>();
    if (signatures == null) return result;
    MessageDigest digest = MessageDigest.getInstance("SHA-256");
    for (Signature signature : signatures) {
      result.add(toHex(digest.digest(signature.toByteArray())));
    }
    return result;
  }

  private void requestInstall(File apk) {
    pendingApk = apk;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
        && !activity.getPackageManager().canRequestPackageInstalls()) {
      Intent settings = new Intent(
        Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
        Uri.parse("package:" + activity.getPackageName())
      );
      activity.startActivity(settings);
      return;
    }
    resumePendingInstall();
  }

  private void launchInstaller(File apk) {
    try {
      Uri uri = FileProvider.getUriForFile(
        activity,
        activity.getPackageName() + ".updates",
        apk
      );
      Intent install = new Intent(Intent.ACTION_VIEW)
        .setDataAndType(uri, "application/vnd.android.package-archive")
        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
      activity.startActivity(install);
    } catch (Exception error) {
      Log.e(TAG, "Cannot launch package installer", error);
      Toast.makeText(activity, R.string.update_failed, Toast.LENGTH_LONG).show();
    }
  }

  private HttpsURLConnection open(URL url) throws IOException {
    return open(url, 15_000, 45_000);
  }

  private HttpsURLConnection open(URL url, int connectMs, int readMs)
      throws IOException {
    HttpsURLConnection connection = (HttpsURLConnection) url.openConnection();
    connection.setConnectTimeout(connectMs);
    connection.setReadTimeout(readMs);
    connection.setInstanceFollowRedirects(true);
    connection.setRequestProperty("Accept", "application/json, application/octet-stream");
    connection.setRequestProperty("User-Agent", "NeoCalendar-Android/" + BuildConfig.VERSION_NAME);
    return connection;
  }

  private long currentVersionCode() {
    return BuildConfig.VERSION_CODE;
  }

  private long dismissedVersionCode() {
    return dismissedThisRun;
  }

  private void dismissVersion(long versionCode) {
    dismissedThisRun = versionCode;
  }

  private static byte[] readLimited(InputStream input, int limit) throws IOException {
    try (InputStream stream = input; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
      byte[] buffer = new byte[4096];
      int count;
      int total = 0;
      while ((count = stream.read(buffer)) != -1) {
        total += count;
        if (total > limit) throw new IOException("Response is too large");
        output.write(buffer, 0, count);
      }
      return output.toByteArray();
    }
  }

  private static byte[] hex(String value) {
    byte[] bytes = new byte[value.length() / 2];
    for (int index = 0; index < bytes.length; index++) {
      bytes[index] = (byte) Integer.parseInt(value.substring(index * 2, index * 2 + 2), 16);
    }
    return bytes;
  }

  private static String toHex(byte[] bytes) {
    StringBuilder value = new StringBuilder(bytes.length * 2);
    for (byte item : bytes) value.append(String.format(Locale.ROOT, "%02x", item));
    return value.toString();
  }

  private static final class Metadata {
    final String version;
    final long versionCode;
    final URL url;
    final String sha256;

    Metadata(String version, long versionCode, URL url, String sha256) {
      this.version = version;
      this.versionCode = versionCode;
      this.url = url;
      this.sha256 = sha256;
    }
  }
}