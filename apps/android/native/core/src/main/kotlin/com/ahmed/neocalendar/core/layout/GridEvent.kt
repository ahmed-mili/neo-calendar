package com.ahmed.neocalendar.core.layout

import java.time.Instant

/** Les seuls champs de `DisplayEvent` que lisent les chevauchements et les
 *  bandes all-day. La fin d'un évènement journée entière est exclusive. */
data class GridEvent(val id: String, val start: Instant, val end: Instant)
