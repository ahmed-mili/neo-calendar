// Le plugin de notification, côté téléphone : rien, et c'est voulu. Android ne
// poste pas ses rappels depuis le JS — il remet la liste au système
// (write_reminders, puis ReminderScheduler), qui les tient même app fermée. Ce
// module n'existe que parce que le bundle Android embarque aussi le code du
// bureau, où le plugin est bien appelé. Il répond donc non, plutôt que de
// promettre une notification que personne ne posterait.
export async function isPermissionGranted():Promise<boolean>{return false}
export async function requestPermission():Promise<"granted"|"denied">{return "denied"}
export function sendNotification(_options:unknown):void{}
