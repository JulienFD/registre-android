package fr.spformation.registrevehicules;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/** Télécharge l'APK d'une release GitHub et ouvre l'installateur Android (les données sont conservées). */
@CapacitorPlugin(name = "Updater")
public class UpdaterPlugin extends Plugin {
  private static final String DEPOT_APK =
      "https://github.com/JulienFD/registre-android/releases/download/";
  private static final int DELAI_MS = 30_000;

  @PluginMethod
  public void getVersion(PluginCall call) {
    try {
      PackageInfo info =
          getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
      JSObject res = new JSObject();
      res.put("versionName", info.versionName);
      call.resolve(res);
    } catch (Exception e) {
      call.reject("Version illisible", e);
    }
  }

  @PluginMethod
  public void install(PluginCall call) {
    String url = call.getString("url");
    if (url == null || !url.startsWith(DEPOT_APK)) {
      call.reject("URL refusée");
      return;
    }
    // Avant Android 8, l'autorisation d'installer ne se demande pas application par application.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
        && !getContext().getPackageManager().canRequestPackageInstalls()) {
      Intent reglage =
          new Intent(
              Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
              Uri.parse("package:" + getContext().getPackageName()));
      reglage.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      getContext().startActivity(reglage);
      call.reject("Autoriser l'installation pour cette application, puis réessayer", "PERMISSION");
      return;
    }
    new Thread(() -> telechargerPuisInstaller(call, url)).start();
  }

  private void telechargerPuisInstaller(PluginCall call, String url) {
    File apk = new File(new File(getContext().getCacheDir(), "updates"), "maj.apk");
    try {
      telecharger(url, apk);
      Uri uri =
          FileProvider.getUriForFile(
              getContext(), getContext().getPackageName() + ".fileprovider", apk);
      Intent installation = new Intent(Intent.ACTION_VIEW);
      installation.setDataAndType(uri, "application/vnd.android.package-archive");
      installation.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
      getContext().startActivity(installation);
      call.resolve();
    } catch (Exception e) {
      call.reject("Téléchargement impossible", e);
    }
  }

  private void telecharger(String url, File destination) throws IOException {
    destination.getParentFile().mkdirs();
    HttpURLConnection connexion = (HttpURLConnection) new URL(url).openConnection();
    connexion.setConnectTimeout(DELAI_MS);
    connexion.setReadTimeout(DELAI_MS);
    try {
      if (connexion.getResponseCode() != HttpURLConnection.HTTP_OK) {
        throw new IOException("HTTP " + connexion.getResponseCode());
      }
      try (InputStream in = connexion.getInputStream();
          OutputStream out = new FileOutputStream(destination)) {
        byte[] tampon = new byte[64 * 1024];
        for (int n = in.read(tampon); n >= 0; n = in.read(tampon)) {
          out.write(tampon, 0, n);
        }
      }
    } finally {
      connexion.disconnect();
    }
  }
}
