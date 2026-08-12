plugins { id("com.android.application") }

android {
 namespace = "com.ahmed.neocalendar"
 compileSdk = 35
 defaultConfig {
  applicationId = "com.ahmed.neocalendar"
  minSdk = 26
  targetSdk = 35
  versionCode = 62
  versionName = "1.38.3"
 }

 // Android n'accepte une mise à jour que si elle porte la même signature que la
 // version déjà posée. Tant que chaque machine signait avec sa propre clé de
 // débogage — celle du PC, puis celle jetable du runner — le téléphone voyait
 // deux applications étrangères l'une à l'autre et refusait : « le package est
 // en conflit avec un package déjà présent ».
 //
 // Cette clé-ci est fixe et voyage avec le dépôt : tous les builds, d'où qu'ils
 // viennent, s'installent par-dessus le précédent. Son mot de passe est en
 // clair et c'est assumé — le fichier est juste à côté, le cacher ne protégerait
 // rien. Elle vaut ce que vaut le dépôt privé qui la contient, et ne sert qu'à
 // se distribuer l'application à soi-même. Une publication sur le Play Store
 // demanderait une clé gardée ailleurs.
 signingConfigs {
  create("distribution") {
   storeFile = file("neo-calendar.jks")
   storePassword = "neo-calendar"
   keyAlias = "neo-calendar"
   keyPassword = "neo-calendar"
  }
 }

 compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }

 buildTypes {
  debug { isMinifyEnabled = false }
  release {
   isMinifyEnabled = false
   signingConfig = signingConfigs.getByName("distribution")
  }
 }
}
