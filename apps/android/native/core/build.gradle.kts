import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins { id("org.jetbrains.kotlin.jvm") }

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

kotlin { compilerOptions { jvmTarget.set(JvmTarget.JVM_17) } }

dependencies {
    api("org.jetbrains.kotlinx:kotlinx-serialization-json:1.11.0")
    implementation("org.dmfs:lib-recur:0.17.1")
    implementation("org.mnode.ical4j:ical4j:4.4.0")
    testImplementation("junit:junit:4.13.2")
}

tasks.test {
    // Le corpus vit à la racine du dépôt, partagé avec Jest.
    systemProperty("conformance.dir", rootProject.file("../../../conformance").absolutePath)
    jvmArgs("-Duser.timezone=Europe/Paris")
    // Le test d'intégration à deux moteurs ne tourne que si SYNCTHING_BINARY désigne un binaire Syncthing v2 de cette machine.
    systemProperty("syncthing.binary", System.getenv("SYNCTHING_BINARY") ?: "")
    testLogging { events("failed"); exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL }
}
