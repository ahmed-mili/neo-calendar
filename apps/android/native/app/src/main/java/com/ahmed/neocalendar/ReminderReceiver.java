package com.ahmed.neocalendar;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Wakes for two things: a reminder coming due, and the phone starting up.
 *
 * Alarms do not survive a reboot, so the list has to be re-armed on boot — or
 * every reminder set before the phone was switched off would be lost without a
 * word. Same after the app is updated, which clears them just as thoroughly.
 */
public class ReminderReceiver extends BroadcastReceiver {
    static final String ACTION_FIRE = "com.ahmed.neocalendar.REMINDER_FIRE";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent == null ? null : intent.getAction();
        if (ACTION_FIRE.equals(action)) {
            ReminderScheduler.fire(context);
            return;
        }
        if (Intent.ACTION_BOOT_COMPLETED.equals(action)
                || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            ReminderScheduler.schedule(context);
        }
    }
}
