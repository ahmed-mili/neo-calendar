package com.ahmed.neocalendar.nativeapp

import com.ahmed.neocalendar.core.workspace.ExclusiveGate

/**
 * L'unique porte du dossier de notes : toute écriture (note, réglages, pièce jointe, fond d'écran, lien ICS) passe par
 * `StorageGate.writing { ... }` et OUVRE le stockage à l'intérieur ; un changement de stockage prend `beginSwitch` et attend
 * donc les écritures en cours, qui ne reprennent qu'une fois le nouveau stockage en place. Hors du fil principal.
 */
val StorageGate = ExclusiveGate()
