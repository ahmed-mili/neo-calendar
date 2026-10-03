package com.ahmed.neocalendar.nativeapp

import com.ahmed.neocalendar.core.workspace.ExclusiveGate
import com.ahmed.neocalendar.nativeapp.sync.SyncController

/**
 * L'unique porte du dossier de notes : toute écriture (note, réglages, pièce jointe, fond d'écran, lien ICS) passe par
 * `StorageGate.writing { ... }` et OUVRE le stockage à l'intérieur ; un changement de stockage prend `beginSwitch` et attend
 * donc les écritures en cours, qui ne reprennent qu'une fois le nouveau stockage en place. Hors du fil principal.
 *
 * Chaque écriture finie demande un scan au moteur de synchro, s'il existe (`peek` : jamais créé pour ça) : la modification
 * part tout de suite vers les autres appareils au lieu d'attendre le surveillant de fichiers.
 */
val StorageGate = ExclusiveGate { SyncController.peek()?.localChanged() }
