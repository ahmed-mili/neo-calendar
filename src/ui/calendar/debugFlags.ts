/**
 * Switches that are ON in a build made to look at something, and OFF in the
 * one people use.
 *
 * They live in a file of their own, one line each, because that is what makes a
 * diagnostic build a one-word change and — more to the point — makes it obvious
 * in a diff when one was left on.
 */

/**
 * Colour the rules at the grid's left edge and show what they measure.
 *
 * On: the hours rail's edge is red, a day column's is green, and a readout in
 * the corner says how far apart everything really is (see gridDebug.ts). For
 * chasing a line that is two pixels wide on a phone and one pixel wide on every
 * machine here.
 */
export const GRID_LINE_DEBUG = true;
