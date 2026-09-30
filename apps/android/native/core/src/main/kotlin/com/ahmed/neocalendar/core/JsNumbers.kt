package com.ahmed.neocalendar.core

import java.math.BigDecimal

/** String(nombre) de JS : décimal simple de 1e-6 (inclus) à 1e21 (exclu), sinon
 *  mantisse et exposant `e+21` / `e-7`. Le JDK donne les mêmes chiffres les
 *  plus courts ; seule la mise en forme diffère. */
internal fun jsNumber(number: Double): String {
    if (number == 0.0) return "0"
    val magnitude = Math.abs(number)
    val digits = BigDecimal(java.lang.Double.toString(magnitude))
    val sign = if (number < 0) "-" else ""
    if (magnitude in 1e-6..<1e21) return sign + digits.stripTrailingZeros().toPlainString()

    val unscaled = digits.stripTrailingZeros().unscaledValue().toString()
    val exponent = unscaled.length - 1 - digits.stripTrailingZeros().scale()
    val mantissa = if (unscaled.length == 1) unscaled else unscaled[0] + "." + unscaled.substring(1)
    return sign + mantissa + "e" + (if (exponent < 0) "-" else "+") + Math.abs(exponent)
}
