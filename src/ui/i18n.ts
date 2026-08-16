/**
 * The calendar's wording, in the language it is asked for.
 *
 * The English string IS the key. That keeps every call site readable — `t("Add
 * event")` says what it will show — and it means an untranslated string falls
 * back to something a person can act on rather than to `calendar.event.add`.
 * A missing French entry shows English, never a key.
 *
 * The language is read once at start-up and applied for the run: switching it
 * reloads the view rather than threading a context through every component,
 * because it is a decision taken once and never again during a session.
 */

export type Language = "fr" | "en";

export const LANGUAGES: Array<{ value: Language; label: string }> = [
    { value: "fr", label: "Français" },
    { value: "en", label: "English" },
];

const STORAGE_KEY = "neo-calendar.language";

/** French wording, keyed by the English it replaces. */
const FR: Record<string, string> = {
    // ── Days and months ──────────────────────────────────────
    // Kept here rather than taken from toLocaleDateString so the grid reads the
    // same whatever locale the machine happens to be set to.
    "days.short": "dim.,lun.,mar.,mer.,jeu.,ven.,sam.",
    "days.min": "di,lu,ma,me,je,ve,sa",
    // Écrits en toutes lettres pour le résumé d'une répétition — « toutes les
    // semaines le mardi » — où le jour est au milieu d'une phrase.
    "days.long": "dimanche,lundi,mardi,mercredi,jeudi,vendredi,samedi",
    "months.short":
        "janv.,févr.,mars,avr.,mai,juin,juil.,août,sept.,oct.,nov.,déc.",
    "months.long":
        "janvier,février,mars,avril,mai,juin,juillet,août,septembre,octobre,novembre,décembre",

    // ── Days of the week, spelled out ────────────────────────
    Sunday: "Dimanche",
    Monday: "Lundi",
    Tuesday: "Mardi",
    Wednesday: "Mercredi",
    Thursday: "Jeudi",
    Friday: "Vendredi",
    Saturday: "Samedi",

    // ── Views and navigation ─────────────────────────────────
    Day: "Jour",
    Week: "Semaine",
    Month: "Mois",
    List: "Liste",
    "3 days": "3 jours",
    "1 day": "1 jour",
    days: "jours",
    Today: "Aujourd'hui",
    "Go to today": "Aller à aujourd'hui",
    "Go to Today": "Aller à aujourd'hui",
    "Go back to today": "Revenir à aujourd'hui",
    Previous: "Précédent",
    Next: "Suivant",
    "Previous month": "Mois précédent",
    "Next month": "Mois suivant",
    Back: "Retour",
    "Number of days": "Nombre de jours",
    "Days displayed": "Jours affichés",
    "Custom number of days": "Nombre de jours personnalisé",
    "More day spans": "Plus de durées",
    "Week numbers": "Numéros de semaine",
    "View settings": "Réglages d'affichage",
    "General settings": "Réglages généraux",
    Filters: "Filtres",
    "Switch to Day View": "Passer à la vue jour",
    "Switch to Week View": "Passer à la vue semaine",
    "Switch to Month View": "Passer à la vue mois",
    "Switch to 3-Day View": "Passer à la vue 3 jours",
    "Switch to List View": "Passer à la vue liste",
    "Toggle Sidebar": "Afficher ou masquer le panneau",
    "Toggle sidebar": "Afficher ou masquer le panneau",

    // ── The event panel ──────────────────────────────────────
    Event: "Événement",
    "Event details": "Détails de l'événement",
    "Event Name": "Titre",
    "New event": "Nouvel événement",
    "Create event": "Créer l'événement",
    "Create a new event": "Créer un événement",
    "Create New Event": "Créer un événement",
    "Event created": "Événement créé",
    "Add event": "Ajouter un événement",
    "Add date": "Ajouter une date",
    "All day": "Toute la journée",
    "All-day": "Toute la journée",
    Repeat: "Répéter",
    Every: "Tous les",
    From: "De",
    Ends: "Fin",
    // Les trois fins possibles d'une répétition, et le résumé qui les relit.
    Never: "Jamais",
    "On date": "Le",
    "After count": "Après",
    occurrences: "occurrences",
    "Every day": "Tous les jours",
    "Every week": "Toutes les semaines",
    "Every month": "Tous les mois",
    "Every year": "Tous les ans",
    "every {n} days": "tous les {n} jours",
    "every {n} weeks": "toutes les {n} semaines",
    "every {n} months": "tous les {n} mois",
    "every {n} years": "tous les {n} ans",
    "on {days}": "le {days}",
    "until {date}": "jusqu'au {date}",
    "{n} times": "{n} fois",
    "Monthly on day {n}": "Le {n} de chaque mois",
    "Monthly on the same weekday": "Le même jour de la semaine chaque mois",
    Period: "Période",
    "Custom period": "Période personnalisée",
    Custom: "Personnalisé",
    Daily: "Quotidien",
    Weekly: "Hebdomadaire",
    Monthly: "Mensuel",
    Yearly: "Annuel",
    "day(s)": "jour(s)",
    "week(s)": "semaine(s)",
    "month(s)": "mois",
    "year(s)": "an(s)",
    Status: "Statut",
    "To do": "À faire",
    Complete: "Terminé",
    // The event/task choice in the panel. `Event` is already spelled out above.
    Type: "Type",
    Task: "Tâche",
    Tasks: "Tâches",
    // The task panel's three sections, plus its empty state and add button.
    "No date": "Sans date",
    Completed: "Terminées",
    Overdue: "En retard",
    // A task's deadline, kept distinct from the day set aside for the work.
    Deadline: "Échéance",
    "Add deadline": "Ajouter une échéance",
    "Remove deadline": "Retirer l'échéance",
    // Taking the date off an event, which is what sends it back to the
    // unscheduled list — the reverse of "Add date" above.
    "Remove date": "Retirer la date",
    // La version, a gauche de l'engrenage : c'est elle le bouton.
    "Check for updates": "Rechercher des mises à jour",
    "Checking…": "Vérification…",
    "Updating…": "Mise à jour…",
    "Up to date": "À jour",
    "Check failed": "Échec",
    Offline: "Hors ligne",
    "Update available": "Mise à jour disponible",
    Update: "Mettre à jour",
    "Removing the date on a repeating event also removes the repeat. It becomes a single unscheduled entry.":
        "Retirer la date d'un événement qui se répète supprime aussi la répétition. Il devient une entrée unique non planifiée.",
    // The steps a task is made of, listed on the task itself.
    Steps: "Étapes",
    "Add a step": "Ajouter une étape",
    "Remove step": "Supprimer l'étape",
    "No tasks yet": "Aucune tâche",
    "Add task": "+ Ajouter une tâche",
    // One-off repair for entries the `completed: false` bug filed as tasks.
    "Convert timed tasks back to events":
        "Reconvertir les tâches horaires en événements",
    Convert: "Convertir",
    "entries converted back to events.": "entrées reconverties en événements.",
    "entries have both a start and an end time, which is the shape of an event rather than a task. They will lose their checkbox. All-day tasks and anything already completed are left untouched.":
        "entrées ont une heure de début et une heure de fin, ce qui est la forme d'un événement et non d'une tâche. Elles perdront leur case à cocher. Les tâches sur toute la journée et celles déjà terminées ne sont pas touchées.",
    Description: "Description",
    Empty: "Vide",
    // La question posée en quittant le panneau après avoir modifié un jour
    // d'une série : cette occurrence seule, ou toute la série.
    "Save a recurring event": "Enregistrer un événement récurrent",
    "Save a recurring task": "Enregistrer une tâche récurrente",
    "This event": "Cet événement",
    "All events": "Tous les événements",
    "This task": "Cette tâche",
    "All tasks": "Toutes les tâches",
    Date: "Date",
    "Pick a date": "Choisir une date",
    "Change time zone": "Changer de fuseau horaire",
    "Change time zone?": "Changer de fuseau horaire ?",
    "Your system time moved to the time zone":
        "L'heure de votre système est passée au fuseau horaire",
    "Add timezone": "Ajouter un fuseau horaire",
    "Rename time zone": "Renommer le fuseau horaire",
    Label: "Libellé",
    Recent: "Récent",
    "Total time": "Temps total",
    "Event totals": "Totaux des événements",
    "Add links and attachments": "Ajouter des liens et des fichiers",
    "Add another link or attachment": "Ajouter un autre lien ou fichier",
    "Add web link": "Ajouter un lien web",
    "Attach files": "Joindre des fichiers",
    "Linked file": "Fichier lié",
    "Linked files": "Fichiers liés",
    "Edit link": "Modifier le lien",
    "Copy link": "Copier le lien",
    "Rename link": "Renommer le lien",
    "Link copied": "Lien copié",
    "Paste it wherever you like": "Collez-le où vous voulez",
    Link: "Lien",
    "Paste a link, or search the vault":
        "Coller un lien, ou chercher dans le coffre",
    "No matching notes": "Aucune note correspondante",
    "Add Obsidian vaults in Settings to search notes.":
        "Ajoutez des coffres Obsidian dans les Réglages pour chercher des notes.",
    "Open note": "Ouvrir la note",
    "Go to note": "Ouvrir la note",
    "View note": "Ouvrir la note",
    "Available once the event is created":
        "Disponible une fois l'événement créé",
    "Delete event": "Supprimer l'événement",
    "Delete task": "Supprimer la tâche",
    "Click again to confirm": "Cliquer à nouveau pour confirmer",
    Untitled: "Sans titre",
    "Back to calendars": "Retour aux calendriers",
    "That does not look like a link": "Ça ne ressemble pas à un lien",
    "This link is already here": "Ce lien est déjà là",
    "This link leads to the same place as one already here":
        "Ce lien mène au même endroit qu'un lien déjà là",
    "No title available for this link — you can name it yourself.":
        "Titre indisponible pour ce lien — vous pouvez le nommer vous-même.",
    "The site did not give a title for this link":
        "Le site n'a pas donné de titre pour ce lien",
    "No event scheduled": "Aucun événement prévu",

    // ── Reminders ────────────────────────────────────────────
    Reminder: "Rappel",
    "No reminder": "Aucun rappel",
    "5 minutes before": "5 minutes avant",
    "10 minutes before": "10 minutes avant",
    "15 minutes before": "15 minutes avant",
    "30 minutes before": "30 minutes avant",
    "1 hour before": "1 heure avant",
    "Tomorrow, all day": "Demain, toute la journée",
    In: "Dans",
    Someday: "Un jour",

    // ── Calendars ────────────────────────────────────────────
    Calendar: "Calendrier",
    Calendars: "Calendriers",
    "Calendar name": "Nom du calendrier",
    "New calendar name": "Nom du nouveau calendrier",
    "Add calendar": "Ajouter un calendrier",
    "Add Calendar": "Ajouter un calendrier",
    "Adding Calendar": "Ajout du calendrier",
    "Create calendar": "Créer le calendrier",
    "Delete calendar": "Supprimer le calendrier",
    "Change color": "Changer la couleur",
    "Change colour": "Changer la couleur",
    Color: "Couleur",
    Icon: "Icône",
    Kind: "Type",
    // Named for what you get, not for how it is stored: "Full note" told you
    // nothing about what the calendar would do.
    "Notes folder": "Dossier de notes",
    "One Markdown file per event, in a folder you pick.":
        "Un fichier Markdown par événement, dans un dossier que vous choisissez.",
    "Online subscription": "Abonnement en ligne",
    "Read-only, from a webcal or HTTPS address.":
        "En lecture seule, depuis une adresse webcal ou HTTPS.",
    "Public holidays": "Jours fériés",
    "Read-only, worked out on the device.":
        "En lecture seule, calculés sur l'appareil.",
    "Full note": "Note complète",
    "Remote ICS": "ICS distant",
    "Auto calendar": "Calendrier automatique",
    "Daily Note": "Note quotidienne",
    "Daily note": "Note quotidienne",
    "Daily notes": "Notes quotidiennes",
    "Its own calendar": "Son propre calendrier",
    "File into": "Classer dans",
    Directory: "Dossier",
    "Directory to store events": "Dossier de stockage des événements",
    "Choose a directory": "Choisir un dossier",
    "Choose a calendar": "Choisir un calendrier",
    "Choose a country": "Choisir un pays",
    "Choose a heading": "Choisir un titre",
    "Choose an existing subfolder or create a new one":
        "Choisir un sous-dossier existant ou en créer un",
    Heading: "Titre",
    "Heading to store events under in the daily note.":
        "Titre sous lequel ranger les événements dans la note quotidienne.",
    Country: "Pays",
    "A country's public holidays, or a custom rule set":
        "Les jours fériés d'un pays, ou un jeu de règles personnalisé",
    "Copy as JSON, to share this calendar":
        "Copier en JSON, pour partager ce calendrier",
    "Import Calendars": "Importer des calendriers",
    "Importing Calendars": "Import des calendriers",
    Import: "Importer",
    "Open calendars": "Ouvrir les calendriers",
    "Close calendars": "Fermer les calendriers",
    "Expand calendars": "Développer les calendriers",
    "Collapse calendars": "Réduire les calendriers",
    "Expand all-day events": "Afficher les événements sur la journée",
    "Collapse all-day events": "Réduire les événements sur la journée",
    "Expand today's agenda": "Développer l'agenda du jour",
    "Collapse today's agenda": "Réduire l'agenda du jour",

    // ── The calendar's event list ────────────────────────────
    All: "Tous",
    "All dates": "Toutes les dates",
    Scheduled: "Planifiés",
    Unscheduled: "Non planifiés",
    "Show totals": "Afficher les totaux",
    "Show only this view": "N'afficher que cette vue",
    "Remove view from list": "Retirer la vue de la liste",
    "Pin panel": "Épingler le panneau",
    "Unpin panel": "Détacher le panneau",
    "Set as default": "Définir par défaut",
    "Set as default (shift-click to change colour)":
        "Définir par défaut (maj-clic pour changer la couleur)",
    "Shift-click to change colour": "Maj-clic pour changer la couleur",
    "Show only this calendar": "N'afficher que ce calendrier",
    "Show previously visible calendars": "Réafficher les calendriers masqués",
    "Remove from list": "Retirer de la liste",

    // ── Search ───────────────────────────────────────────────
    Search: "Rechercher",
    "Search events": "Rechercher un événement",
    "Add event… (e.g. lunch with Alex tomorrow 12pm)":
        "Ajouter un événement… (ex. déjeuner avec Alex demain 12h)",
    "Search events or type a command…":
        "Rechercher un événement ou une commande…",
    "Time zone…": "Fuseau horaire…",
    "Days…": "Jours…",
    "Search events or type a command...":
        "Rechercher un événement ou une commande…",
    "No events found": "Aucun événement trouvé",
    "No results found": "Aucun résultat",
    "Clear search": "Effacer la recherche",
    "Open command menu": "Ouvrir le menu de commandes",
    "Keyboard shortcuts": "Raccourcis clavier",
    "Find keyboard shortcuts": "Rechercher un raccourci",
    Actions: "Actions",
    Navigation: "Navigation",
    View: "Affichage",

    // ── Common verbs and controls ────────────────────────────
    Save: "Enregistrer",
    Cancel: "Annuler",
    Close: "Fermer",
    Delete: "Supprimer",
    Duplicate: "Dupliquer",
    Copy: "Copier",
    Copied: "Copié",
    Rename: "Renommer",
    "Click to rename": "Cliquer pour renommer",
    Apply: "Appliquer",
    Show: "Afficher",
    Hide: "Masquer",
    Collapse: "Réduire",
    More: "Plus",
    "More options": "Plus d'options",
    "Dismiss error": "Masquer l'erreur",

    // ── The settings screen ──────────────────────────────────
    Settings: "Paramètres",
    "Calendar view": "Vue du calendrier",
    "Without “Create an event by tapping a day of the month”, tapping a day opens the day view instead.":
        "Sans « Créer un événement en cliquant un jour du mois », un clic dans le mois ouvre la vue du jour.",
    "Initial view on desktop": "Vue initiale sur ordinateur",
    "Initial view on phone": "Vue initiale sur téléphone",
    "First day of the week": "Premier jour de la semaine",
    "24-hour time": "Format 24 heures",
    "Create an event by tapping a day of the month":
        "Créer un événement en cliquant un jour du mois",
    "Free scrolling between days": "Défilement libre entre les jours",
    "New events created as tasks": "Nouveaux événements créés comme des tâches",
    Appearance: "Apparence",
    Theme: "Thème",
    "Colour mode": "Mode de couleur",
    System: "Système",
    Light: "Clair",
    Dark: "Sombre",
    Language: "Langue",
    Integrations: "Intégrations",
    "Time zones": "Fuseaux horaires",
    None: "Aucun",
    Data: "Données",
    "Data folder": "Dossier de données",
    "Obsidian vaults": "Coffres Obsidian",
    "No folder": "Aucun dossier",
    Sync: "Synchronisation",
    "An extra hour column appears in the week, day and three-day views.":
        "Une colonne d'heures supplémentaire apparaît dans les vues semaine, jour et trois jours.",
    "Time zone to add": "Fuseau horaire à ajouter",
    "Time zones added": "Fuseaux ajoutés",
    "Neo Calendar keeps its calendar files in this folder. Each direct subfolder is a calendar.":
        "Neo Calendar range ses fichiers de calendrier dans ce dossier. Chaque sous-dossier direct est un calendrier.",
    "Change folder": "Changer de dossier",
    "Open folder": "Ouvrir le dossier",
    "Add the folder that holds your Obsidian vaults. Those sitting directly inside it with an .obsidian folder are detected.":
        "Ajoutez le dossier qui contient vos coffres Obsidian. Ceux qui s'y trouvent directement et possèdent un dossier .obsidian sont détectés.",
    "Choosing…": "Sélection…",
    "Add a folder": "Ajouter un dossier",
    "Folders added": "Dossiers ajoutés",
    "Vaults detected — scanning…": "Coffres détectés — analyse…",
    "Vaults detected": "Coffres détectés",
    "Turn a vault off to leave it out of note search.":
        "Désactivez un coffre pour l'exclure de la recherche de notes.",
    "No vault detected": "Aucun coffre détecté",
    "Each direct subfolder of the data folder is a calendar.":
        "Chaque sous-dossier direct du dossier de données est un calendrier.",
    "Full note, ICS or automatic": "Note complète, ICS ou automatique",
    "It can be a full note, an ICS subscription, or one detected automatically.":
        "Il peut être une note complète, un abonnement ICS, ou détecté automatiquement.",
    "Neo Calendar keeps its data in the folder you choose. Syncing is done by whichever tool you settle on.":
        "Neo Calendar range ses données dans le dossier que vous choisissez. La synchronisation est assurée par l'outil que vous retenez.",
    "Possible methods": "Méthodes possibles",
    Recommended: "Recommandé",
    "Online storage": "Stockage en ligne",
    "OneDrive, Google Drive, Dropbox": "OneDrive, Google Drive, Dropbox",
    "Manual transfer": "Transfert manuel",
    "Over USB": "Par USB",
    "Close settings": "Fermer les paramètres",

    // ── Themes, wallpapers and dialogs ───────────────────────
    Background: "Arrière-plan",
    Foreground: "Avant-plan",
    Accent: "Accentuation",
    "No wallpaper": "Aucun fond d'écran",
    Wallpapers: "Fonds d'écran",
    Themes: "Thèmes",
    "System mode": "Mode système",
    "Light mode": "Mode clair",
    "Dark mode": "Mode sombre",
    "Copy theme": "Copier le thème",
    "Import a theme": "Importer un thème",
    "Reset this theme": "Réinitialiser ce thème",
    Reset: "Réinitialiser",
    Colours: "Couleurs",
    Fonts: "Polices",
    "Unsaved changes": "Modifications non enregistrées",
    "The preview and the app update instantly.":
        "L’aperçu et l’application se mettent à jour instantanément.",
    "Theme copied": "Thème copié",
    "Theme reset": "Thème réinitialisé",
    "Changes saved": "Modifications enregistrées",
    "Could not copy the theme": "Impossible de copier le thème",
    "Invalid theme file": "Fichier de thème invalide",
    "Colours must use the #RRGGBB format":
        "Les couleurs doivent utiliser le format #RRGGBB",
    "Interface font": "Police de l’interface utilisateur",
    "Monospace font": "Police monospace",
    "Translucent sidebar": "Barre latérale translucide",
    Contrast: "Contraste",
    "Wallpaper adjustments": "Ajustements du fond",
    "Wallpaper brightness": "Luminosité du fond",
    "Wallpaper blur": "Flou du fond",
    "Container opacity": "Opacité des conteneurs",
    "Theme default": "Par défaut du thème",
    "Pick a colour": "Choisir une couleur",
    Wallpaper: "Image de fond",
    "Tap to set as default, double-tap to rename":
        "Cliquer pour définir par défaut, double-cliquer pour renommer",
    "Read-only calendar; double-tap to rename":
        "Calendrier en lecture seule ; double-cliquer pour renommer",
    Default: "Par défaut",
    "Each event is one Markdown file.":
        "Chaque événement est un fichier Markdown.",
    "Read-only subscription to a webcal or HTTPS URL.":
        "Abonnement en lecture seule à une URL webcal ou HTTPS.",
    "Read-only events, computed locally from rules.":
        "Événements en lecture seule, calculés localement à partir de règles.",
    "A calendar already has this name.": "Un calendrier porte déjà ce nom.",
    "Enter a calendar name.": "Saisissez un nom de calendrier.",
    "The custom calendar JSON is invalid.":
        "Le JSON du calendrier personnalisé est invalide.",
    "The JSON must contain id, name and a valid rules array.":
        "Le JSON doit contenir id, name et un tableau rules valide.",
    "Calendar type": "Type de calendrier",
    "Calendar JSON": "JSON du calendrier",
    "Import a rules JSON": "Importer un JSON de règles",
    Preset: "Modèle",
    Colour: "Couleur",
    "Add the calendar": "Ajouter le calendrier",
    Confirm: "Confirmer",
    "Choose the folder": "Choisir le dossier",
    "Choose your Neo Calendar data folder.":
        "Choisissez le dossier de données de Neo Calendar.",
    "Calendar files stay outside every Obsidian vault.":
        "Les fichiers de calendrier restent hors de tout coffre Obsidian.",
};

const DICTIONARIES: Record<Language, Record<string, string>> = {
    fr: FR,
    en: {},
};

function readStoredLanguage(): Language {
    if (typeof localStorage === "undefined") return "fr";
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "en" || stored === "fr" ? stored : "fr";
}

let current: Language = readStoredLanguage();

export function getLanguage(): Language {
    return current;
}

/**
 * Switches the language for the next run.
 *
 * The wording is read at render time from a module-level dictionary, so every
 * string already on screen keeps the language it was rendered in. Reloading is
 * what makes the change visible, and it is honest about it: a language is
 * chosen once, not toggled back and forth.
 */
export function setLanguage(language: Language): void {
    if (language === current) return;
    current = language;
    if (typeof localStorage !== "undefined") {
        localStorage.setItem(STORAGE_KEY, language);
    }
    if (typeof window !== "undefined") window.location.reload();
}

/** Used by tests and by callers that need a specific language, without reload. */
export function applyLanguage(language: Language): void {
    current = language;
}

/** The wording for a phrase, falling back to the phrase itself. */
export function t(key: string): string {
    return DICTIONARIES[current][key] ?? key;
}

/** A list that is one string in the dictionary, e.g. the months. */
export function tList(key: string, fallback: string[]): string[] {
    const entry = DICTIONARIES[current][key];
    return entry ? entry.split(",") : fallback;
}
