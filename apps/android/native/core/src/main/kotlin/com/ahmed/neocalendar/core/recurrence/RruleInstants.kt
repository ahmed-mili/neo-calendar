package com.ahmed.neocalendar.core.recurrence

import com.ahmed.neocalendar.core.notes.NeoEvent
import java.time.Instant
import java.time.ZoneOffset
import org.dmfs.rfc5545.DateTime
import org.dmfs.rfc5545.recur.RecurrenceRule

/**
 * Les occurrences d'une série `rrule`, dans l'ordre, ancrées à minuit UTC de
 * `startDate` comme `rruleOf` (src/ui/calendar/recurrenceDeletion.ts). Null
 * quand la règle ou la date d'ancrage est illisible. La séquence est
 * paresseuse (une règle sans fin n'a pas de dernier terme) et peut lever
 * pendant qu'on la parcourt : l'appelant l'enveloppe d'un try.
 */
internal fun rruleInstants(event: NeoEvent.Rrule): Sequence<Instant>? {
    val anchor = parseIsoDate(event.startDate) ?: return null
    val start = DateTime(DateTime.UTC, anchor.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli())
    val iterator = try {
        // rrulestr accepte la règle avec ou sans son préfixe « RRULE: ». lib-recur
        // refuse, à la création de l'itérateur, un UNTIL qui n'est pas en UTC.
        RecurrenceRule(event.rrule.removePrefix("RRULE:")).iterator(start)
    } catch (_: Exception) {
        return null
    }
    return sequence {
        while (iterator.hasNext()) yield(Instant.ofEpochMilli(iterator.nextMillis()))
    }
}
