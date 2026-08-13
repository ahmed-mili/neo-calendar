# Politique de sécurité

## Versions prises en charge

Seule la dernière version stable publiée dans GitHub Releases reçoit les correctifs de sécurité.

## Signaler une vulnérabilité

N'ouvrez pas d'issue publique pour une vulnérabilité. Utilisez le formulaire privé GitHub :

https://github.com/ahmed-mili/neo-calendar/security/advisories/new

Indiquez la version concernée, les étapes de reproduction, l'impact estimé et, si possible, une proposition de correction. Ne joignez aucune donnée de calendrier réelle, clé de signature, jeton ou autre secret.

## Chaîne de mise à jour

Les mises à jour Windows sont vérifiées par la signature Tauri embarquée dans l'application. Les mises à jour Android sont acceptées seulement si le SHA-256 téléchargé correspond aux métadonnées de release, si le nom de paquet et le `versionCode` sont attendus, et si le certificat APK est identique à celui de l'application installée.