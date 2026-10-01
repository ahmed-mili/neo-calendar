// Le corpus de conformité (`conformance/`) fige des dates en heure de Paris,
// celle du téléphone et du PC ; le noyau Kotlin la fixe de son côté par
// `-Duser.timezone`. Un `process.env.TZ` posé dans un fichier de test ne sert
// à rien : Jest donne à chaque fichier une copie de `process.env`, que Node ne
// relit pas. Posé ici, dans le processus parent et avant le lancement des
// workers, le fuseau est hérité par tous — sur la CI en UTC comme ailleurs.
// La 1.83.0 a échoué en CI pour cette raison (327 cas décalés d'une ou deux
// heures), alors que tout passait sur une machine déjà réglée sur Paris.
module.exports = async () => {
    process.env.TZ = "Europe/Paris";
};
