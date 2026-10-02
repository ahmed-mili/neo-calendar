package com.ahmed.neocalendar.core.appearance

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ContrastTest {
    @Test fun `noir sur blanc vaut 21`() {
        assertEquals(21.0, contrastRatio(0xFF000000L, 0xFFFFFFFFL), 1e-9)
        assertEquals(1.0, contrastRatio(0xFFFFFFFFL, 0xFFFFFFFFL), 1e-9)
    }

    @Test fun `le gris 767676 passe 4,5 sur blanc, 777777 non`() {
        assertTrue(contrastRatio(0xFF767676L, 0xFFFFFFFFL) >= 4.5)
        assertTrue(contrastRatio(0xFF777777L, 0xFFFFFFFFL) < 4.5)
    }

    @Test fun `un premier plan translucide est compose sur son fond`() {
        assertEquals(0xFF808080L, over(0x80FFFFFFL, 0xFF000000L))
        assertEquals(contrastRatio(0xFF808080L, 0xFF000000L), contrastRatio(0x80FFFFFFL, 0xFF000000L), 0.02)
    }

    @Test fun `du blanc ou du noir selon le fond`() {
        assertEquals(0xFF000000L, readableOn(0xFFFFFFFFL))
        assertEquals(0xFFFFFFFFL, readableOn(0xFF000000L))
    }
}
