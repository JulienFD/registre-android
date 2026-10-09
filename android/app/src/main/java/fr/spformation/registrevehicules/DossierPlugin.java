package fr.spformation.registrevehicules;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.content.UriPermission;
import android.net.Uri;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import androidx.documentfile.provider.DocumentFile;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.IOException;
import java.io.OutputStream;
import java.util.regex.Pattern;

/**
 * Copie les PDF dans un dossier choisi par l'utilisateur (sélecteur de dossier Android, SAF).
 * Aucune permission de stockage : seul le dossier choisi est accessible.
 */
@CapacitorPlugin(name = "Dossier")
public class DossierPlugin extends Plugin {
  private static final Pattern NOM_SUR = Pattern.compile("[A-Za-z0-9_-][A-Za-z0-9._-]{0,150}");
  private static final String TYPE_PDF = "application/pdf";

  @PluginMethod
  public void choisir(PluginCall call) {
    Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
    intent.addFlags(
        Intent.FLAG_GRANT_READ_URI_PERMISSION
            | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
    startActivityForResult(call, intent, "dossierChoisi");
  }

  @ActivityCallback
  private void dossierChoisi(PluginCall call, ActivityResult resultat) {
    Intent donnees = resultat.getData();
    if (resultat.getResultCode() != Activity.RESULT_OK || donnees == null || donnees.getData() == null) {
      call.reject("Aucun dossier choisi", "ANNULE");
      return;
    }
    Uri arbre = donnees.getData();
    getContext()
        .getContentResolver()
        .takePersistableUriPermission(
            arbre, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
    DocumentFile racine = DocumentFile.fromTreeUri(getContext(), arbre);
    JSObject res = new JSObject();
    res.put("uri", arbre.toString());
    res.put("nom", racine != null && racine.getName() != null ? racine.getName() : arbre.getLastPathSegment());
    call.resolve(res);
  }

  @PluginMethod
  public void oublier(PluginCall call) {
    String arbre = call.getString("arbre");
    if (arbre != null && autorise(Uri.parse(arbre))) {
      getContext()
          .getContentResolver()
          .releasePersistableUriPermission(
              Uri.parse(arbre),
              Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
    }
    call.resolve();
  }

  /** Écrit nom dans le sous-dossier `dossier` de l'arbre ; sans `ecraser`, un fichier existant est conservé. */
  @PluginMethod
  public void ecrire(PluginCall call) {
    String arbre = call.getString("arbre");
    String dossier = call.getString("dossier");
    String nom = call.getString("nom");
    String donnees = call.getString("data");
    boolean ecraser = Boolean.TRUE.equals(call.getBoolean("ecraser", false));
    if (arbre == null
        || donnees == null
        || dossier == null
        || nom == null
        || !NOM_SUR.matcher(dossier).matches()
        || !NOM_SUR.matcher(nom).matches()) {
      call.reject("Paramètres invalides");
      return;
    }
    Uri uriArbre = Uri.parse(arbre);
    if (!autorise(uriArbre)) {
      call.reject("Dossier de copie inaccessible : le choisir à nouveau dans les réglages", "PERMISSION");
      return;
    }
    try {
      DocumentFile racine = DocumentFile.fromTreeUri(getContext(), uriArbre);
      if (racine == null || !racine.canWrite()) {
        call.reject("Dossier de copie inaccessible : le choisir à nouveau dans les réglages", "PERMISSION");
        return;
      }
      DocumentFile sousDossier = racine.findFile(dossier);
      if (sousDossier == null) {
        sousDossier = racine.createDirectory(dossier);
      }
      if (sousDossier == null) {
        throw new IOException("Création du dossier impossible");
      }
      DocumentFile fichier = sousDossier.findFile(nom);
      boolean existait = fichier != null;
      JSObject res = new JSObject();
      if (existait && !ecraser) {
        res.put("ecrit", false);
        call.resolve(res);
        return;
      }
      if (!existait) {
        fichier = sousDossier.createFile(TYPE_PDF, nom);
      }
      if (fichier == null) {
        throw new IOException("Création du fichier impossible");
      }
      ecrireOctets(fichier.getUri(), Base64.decode(donnees, Base64.DEFAULT));
      res.put("ecrit", true);
      call.resolve(res);
    } catch (Exception e) {
      call.reject("Écriture impossible : " + e.getMessage(), e);
    }
  }

  private void ecrireOctets(Uri fichier, byte[] octets) throws IOException {
    ContentResolver resolveur = getContext().getContentResolver();
    // "wt" tronque le fichier existant avant d'écrire.
    try (OutputStream out = resolveur.openOutputStream(fichier, "wt")) {
      if (out == null) {
        throw new IOException("Fichier non ouvert");
      }
      out.write(octets);
    }
  }

  /** Seuls les dossiers que l'utilisateur a choisis (permission persistante) sont écrits. */
  private boolean autorise(Uri arbre) {
    for (UriPermission p : getContext().getContentResolver().getPersistedUriPermissions()) {
      if (p.getUri().equals(arbre) && p.isWritePermission()) {
        return true;
      }
    }
    return false;
  }
}
