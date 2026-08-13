package com.ahmed.neocalendar;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Log;
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
  private static final long NO_UPDATE_RECHECK_MS = 6L * 60L * 60L * 1000L;
  private static final long LATER_RECHECK_MS = 24L * 60L * 60L * 1000L;
  private static final long FAILURE_RECHECK_MS = 60L * 60L * 1000L;
  private static final int MAX_METADATA_BYTES = 64 * 1024;
  private static final long MAX_APK_BYTES = 200L * 1024L * 1024L;
  private static final String PREFS = "neo_updates";
  private static final String PREF_NEXT_CHECK = "next_check_at";

  private final Activity activity;
  private final ExecutorService io;
  private File pendingApk;

  AppUpdater(Activity activity, ExecutorService io) {
    this.activity = activity;
    this.io = io;
  }

  void checkOnLaunch() {
    if (BuildConfig.DEBUG) return;
    long nextCheck = activity.getSharedPreferences(PREFS, Activity.MODE_PRIVATE)
      .getLong(PREF_NEXT_CHECK, 0L);
    if (System.currentTimeMillis() < nextCheck) return;

    io.execute(() -> {
      try {
        Metadata metadata = fetchMetadata();
        if (metadata.versionCode <= currentVersionCode()) {
          postpone(NO_UPDATE_RECHECK_MS);
          return;
        }
        activity.runOnUiThread(() -> showPrompt(metadata));
      } catch (Exception error) {
        postpone(FAILURE_RECHECK_MS);
        Log.w(TAG, "Update check failed", error);
      }
    });
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

  private void showPrompt(Metadata metadata) {
    if (activity.isFinishing() || activity.isDestroyed()) return;
    new AlertDialog.Builder(activity)
      .setTitle(R.string.update_available)
      .setMessage(activity.getString(R.string.update_message, metadata.version))
      .setNegativeButton(R.string.update_later, (dialog, which) -> postpone(LATER_RECHECK_MS))
      .setPositiveButton(R.string.update_install, (dialog, which) -> download(metadata))
      .show();
  }

  private void download(Metadata metadata) {
    Toast.makeText(activity, R.string.update_downloading, Toast.LENGTH_SHORT).show();
    io.execute(() -> {
      try {
        File apk = downloadAndVerify(metadata);
        activity.runOnUiThread(() -> requestInstall(apk));
      } catch (Exception error) {
        postpone(FAILURE_RECHECK_MS);
        Log.e(TAG, "Update download failed", error);
        activity.runOnUiThread(() ->
          Toast.makeText(activity, R.string.update_failed, Toast.LENGTH_LONG).show()
        );
      }
    });
  }

  private Metadata fetchMetadata() throws Exception {
    URL url = new URL(METADATA_URL);
    HttpsURLConnection connection = open(url);
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
        while ((count = input.read(buffer)) != -1) {
          written += count;
          if (written > MAX_APK_BYTES) throw new IOException("Update is too large");
          digest.update(buffer, 0, count);
          output.write(buffer, 0, count);
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
    HttpsURLConnection connection = (HttpsURLConnection) url.openConnection();
    connection.setConnectTimeout(15_000);
    connection.setReadTimeout(45_000);
    connection.setInstanceFollowRedirects(true);
    connection.setRequestProperty("Accept", "application/json, application/octet-stream");
    connection.setRequestProperty("User-Agent", "NeoCalendar-Android/" + BuildConfig.VERSION_NAME);
    return connection;
  }

  private long currentVersionCode() {
    return BuildConfig.VERSION_CODE;
  }

  private void postpone(long delayMs) {
    activity.getSharedPreferences(PREFS, Activity.MODE_PRIVATE)
      .edit()
      .putLong(PREF_NEXT_CHECK, System.currentTimeMillis() + delayMs)
      .apply();
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