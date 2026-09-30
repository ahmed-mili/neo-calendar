import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins { id("org.jetbrains.kotlin.jvm") }

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

kotlin { compilerOptions { jvmTarget.set(JvmTarget.JVM_17) } }

dependencies {
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.11.0")
    implementation("org.dmfs:lib-recur:0.17.1")
    testImplementation("junit:junit:4.13.2")
}

tasks.test {
    // Le corpus vit à la racine du dépôt, partagé avec Jest.
    systemProperty("conformance.dir", rootProject.file("../../../conformance").absolutePath)
    jvmArgs("-Duser.timezone=Europe/Paris")
    testLogging { events("failed"); exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL }
}
