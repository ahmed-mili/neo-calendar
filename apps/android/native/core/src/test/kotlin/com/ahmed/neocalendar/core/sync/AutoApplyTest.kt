package com.ahmed.neocalendar.core.sync

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AutoApplyTest {
    @Test fun `une proposition s'applique sans question`() {
        assertTrue(shouldAutoApply(ProposalDecision.Adopt, false))
        assertTrue(shouldAutoApply(ProposalDecision.ShareExisting, false))
        assertTrue(shouldAutoApply(ProposalDecision.Replace("old"), false))
    }

    @Test fun `un refus reste affiche et une proposition deja essayee n'est pas rejouee`() {
        assertFalse(shouldAutoApply(ProposalDecision.Refuse("non"), false))
        assertFalse(shouldAutoApply(ProposalDecision.Adopt, true))
    }
}
