using System;
using System.Diagnostics;
using System.Text;

/*
 * Lance une commande sans qu'aucune console n'apparaisse, même une fraction de
 * seconde.
 *
 * Un raccourci Windows ne sait pas cacher une console : un .lnk ne transmet que
 * « normale », « réduite » ou « agrandie ». Et `powershell -WindowStyle Hidden`
 * ne suffit pas — la console est créée PUIS cachée, ce qui se voit (mesuré :
 * une fenêtre console apparaît bel et bien pendant le démarrage).
 *
 * Ce programme-ci est compilé en sous-système fenêtré : il n'a pas de console à
 * lui, et il démarre son enfant avec CreateNoWindow, donc l'enfant n'en reçoit
 * pas non plus. Il rend la main aussitôt, sans attendre.
 *
 * Compilé par scripts/install-emulator-shortcut.ps1, jamais commité en binaire.
 */
static class RunHidden
{
    static int Main(string[] args)
    {
        if (args.Length == 0) return 2;

        // Les arguments sont re-guillemetés un par un : le chemin du script
        // passe par « C:\Users\... » et un dossier au nom espacé serait sinon
        // reçu comme plusieurs arguments.
        var rest = new StringBuilder();
        for (int i = 1; i < args.Length; i++)
        {
            if (rest.Length > 0) rest.Append(' ');
            rest.Append('"').Append(args[i]).Append('"');
        }

        var startInfo = new ProcessStartInfo(args[0], rest.ToString());
        startInfo.UseShellExecute = false;
        startInfo.CreateNoWindow = true;

        try
        {
            Process.Start(startInfo);
        }
        catch
        {
            return 1;
        }

        return 0;
    }
}
