# Installer

Les deux paquets sont publiés sur la page
[Releases](https://github.com/ahmed-mili/neo-calendar/releases) du dépôt :
prenez la dernière version, en haut.

- **PC** : `Neo-Calendar-Setup-<version>.exe`. Windows affiche un avertissement
  SmartScreen — l'installateur n'est pas signé — : « Informations
  complémentaires », puis « Exécuter quand même ».
- **Android** : `neo-calendar-android-<version>.apk`. Téléchargez-le depuis le
  téléphone ; Android demande d'autoriser l'installation depuis cette
  source-là, une seule fois.

## Une désinstallation à faire une fois, en venant d'une version antérieure à 1.0.3

Android n'accepte une mise à jour que si elle porte la même signature que la
version déjà installée. Jusqu'à la 1.0.2, chaque machine signait avec sa propre
clé de débogage — celle du PC, puis celle, jetable, du serveur de build — et le
téléphone refusait : « le package est en conflit avec un package déjà présent ».

Depuis la 1.0.3, tous les APK stables portent la même identité de signature.
Sa clé privée et ses mots de passe vivent maintenant hors du dépôt et sont
injectés dans la CI par GitHub Actions Secrets. Pour passer d'une version
antérieure, une seule fois : **désinstallez l'application, puis installez le
nouvel APK**. Les versions suivantes s'installeront par-dessus, sans rien perdre.

## Mises à jour automatiques

Après installation d'une version qui contient le nouvel updater :

- **Windows** vérifie la release stable au démarrage, contrôle sa signature
  Tauri, installe l'update en mode passif, puis redémarre l'application.
- **Android** vérifie la release stable, contrôle le SHA-256, le nom du paquet,
  le `versionCode` et le certificat de l'APK, puis ouvre l'installateur système.
  Android demandera une fois l'autorisation d'installer depuis Neo Calendar.

Les versions plus anciennes ne peuvent pas acquérir ce code toutes seules : la
première version compatible devra encore être installée manuellement. La
signature Tauri protège l'update, mais ne remplace pas une signature de code
Windows reconnue ; SmartScreen peut donc continuer d'afficher son avertissement.
