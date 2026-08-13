# Passage du dépôt en public et mises à jour automatiques

État de l'audit : 13 août 2026. Ne pas rendre le dépôt public avant d'avoir terminé les éléments marqués **bloquants**.

## Bloquants avant le changement de visibilité

1. **Nettoyer tout l'historique Git, puis forcer la mise à jour de toutes les références distantes.** La clé Android, ses anciens mots de passe, des journaux appareil, des ZIP, des sauvegardes et des captures sont présents dans les commits existants. Les retirer seulement de `HEAD` ne suffit pas.
2. **Installer les six secrets GitHub Actions** : `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`, `TAURI_SIGNING_PRIVATE_KEY` et `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Les fichiers locaux correspondants sont dans `C:\Users\Ahmed\.neo-calendar\signing` et ne doivent jamais être copiés dans le dépôt.
3. **Sauvegarder hors ligne le dossier de signature** dans au moins deux emplacements chiffrés. Perdre la clé Android empêche toute mise à jour des installations existantes. Perdre la clé privée Tauri empêche toute mise à jour automatique des installations desktop qui embarquent sa clé publique.
4. **Refaire un scan Gitleaks sur toutes les références après la réécriture**, puis vérifier manuellement les archives, images, journaux, adresses e-mail, chemins locaux et données de calendrier.
5. **Confirmer les droits de redistribution** de chaque fond d'écran, icône, police et ressource tierce. Une licence du code ne donne pas automatiquement le droit de republier les images.
6. **Contrôler l'historique GitHub Actions** : après passage en public, les anciens logs et artefacts deviennent visibles. Supprimer toute exécution ou artefact contenant un chemin local, une donnée utilisateur ou une information de diagnostic sensible.

Changer uniquement les mots de passe du keystore ne remplace pas sa clé privée. L'identité Android actuelle a volontairement été conservée pour que les APK futurs s'installent par-dessus les versions existantes. Si la clé privée a pu être copiée par une personne non fiable, il faut au contraire générer une nouvelle identité et accepter une désinstallation/réinstallation unique.

## Configuration GitHub à appliquer juste avant/après publication

- Protéger `main` avec un ruleset : pull request obligatoire, tests obligatoires, conversations résolues, interdiction des force-push et suppressions, contournement limité au propriétaire.
- Conserver les permissions Actions par défaut en lecture. Le workflow Release donne `contents: write` au seul job de publication.
- Restreindre les Actions autorisées aux actions GitHub et aux actions explicitement approuvées. Le workflow versionne des SHA immuables et Dependabot doit maintenir ces références.
- Activer Dependency graph, Dependabot alerts, Dependabot security updates, secret scanning, push protection, CodeQL et private vulnerability reporting.
- Activer les mises à jour de branche et, si souhaité, l'auto-merge pour les PR Dependabot qui passent tous les contrôles.
- Vérifier la description, les topics, la licence MIT, `SECURITY.md`, les issues et le formulaire de signalement privé.

GitHub désactive les push rulesets lors d'un passage privé vers public : recréer ou réactiver les protections après le changement de visibilité.

## Déploiement des mises à jour

La première version contenant les updaters est une version d'amorçage : les utilisateurs des versions antérieures devront encore l'installer manuellement une fois. Les versions suivantes seront détectées automatiquement.

- Windows : Tauri télécharge `latest.json`, vérifie la signature de l'installateur, installe en mode passif et redémarre l'application. Cette signature d'update n'est pas une signature Authenticode : SmartScreen continuera d'avertir tant qu'un certificat de signature de code Windows reconnu n'aura pas été ajouté à la CI.
- Android : l'application consulte `latest-android.json`, télécharge l'APK depuis la release GitHub, vérifie SHA-256, paquet, version et certificat, puis ouvre l'installateur système. Android demandera une fois l'autorisation « installer des applications inconnues » pour Neo Calendar.
- Google Play : si l'application est un jour distribuée par le Play Store, retirer le flux APK direct et `REQUEST_INSTALL_PACKAGES`, adopter Play App Signing et l'API Play In-App Updates.

Chaque release stable doit publier ensemble l'APK, l'installateur Windows, son `.sig`, `latest-android.json` et `latest.json`. Les deux applications sont donc reconstruites à chaque version stable.

## Validation finale

- `npm test`
- `npm audit` dans `/`, `/apps/windows` et `/apps/android`
- `cargo check --locked` et `cargo audit`
- build Android debug puis release avec vérification `apksigner`
- build Tauri/NSIS avec présence de l'installateur et du `.sig`
- déclenchement manuel du workflow Release sur le dépôt encore privé
- installation d'une version d'amorçage sur une machine et un téléphone de test, puis publication d'une version supérieure pour tester le chemin complet
- seulement ensuite : passage du dépôt en public