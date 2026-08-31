import { NeoEvent } from "../../../../src/types";
import {
    extractFrontmatter,
    parseFrontmatter,
    serializeEventMarkdown,
} from "./desktopEventFormat";

/**
 * A note that a generator owns end to end.
 *
 * The union is a discriminated one so a second generator (the Islamic calendar)
 * can join without the ICS transport knowing anything about it. Only the
 * `neo-calendar:ics` arm is produced and parsed in this delivery; the other arm
 * exists so the shared note engine already has a shape to grow into.
 */
export type ManagedEventMetadata =
    | {
          neoManagedBy: "neo-calendar:ics";
          neoManagedVersion: 1;
          neoIcsFeedId: string;
          neoIcsUid: string;
          neoIcsRecurrenceId: string | null;
          neoIcsStatus: "confirmed";
      }
    | {
          neoManagedBy: "neo-calendar:islamic";
          neoManagedVersion: 1;
          neoIslamicId: string;
          neoIslamicCategory: string;
          neoIslamicTraditions: string[];
      };

/** The frontmatter keys this module owns, for every arm of the union. */
const MANAGED_KEYS = [
    "neoManagedBy",
    "neoManagedVersion",
    "neoIcsFeedId",
    "neoIcsUid",
    "neoIcsRecurrenceId",
    "neoIcsStatus",
    "neoIslamicId",
    "neoIslamicCategory",
    "neoIslamicTraditions",
] as const;

const MANAGED_KEY_SET = new Set<string>(MANAGED_KEYS);

function quote(value: string): string {
    return JSON.stringify(value);
}

/** The frontmatter lines for one metadata record, in a stable order. */
function managedLines(metadata: ManagedEventMetadata): string[] {
    if (metadata.neoManagedBy === "neo-calendar:ics") {
        return [
            `neoManagedBy: ${quote(metadata.neoManagedBy)}`,
            `neoManagedVersion: ${metadata.neoManagedVersion}`,
            `neoIcsFeedId: ${quote(metadata.neoIcsFeedId)}`,
            `neoIcsUid: ${quote(metadata.neoIcsUid)}`,
            `neoIcsRecurrenceId: ${
                metadata.neoIcsRecurrenceId === null
                    ? "null"
                    : quote(metadata.neoIcsRecurrenceId)
            }`,
            `neoIcsStatus: ${quote(metadata.neoIcsStatus)}`,
        ];
    }

    // The Islamic arm is a type-level placeholder in this delivery: nothing
    // produces it yet, so serializing one is a programming error rather than a
    // supported path.
    throw new Error("Islamic managed notes are not produced in this version.");
}

/**
 * Serialize an event note and stamp it with its managed markers.
 *
 * The event frontmatter is written exactly as {@link serializeEventMarkdown}
 * would write it; the recognized `neo*` marker lines are then appended, any
 * previous copy of them removed first, so a feed id or status change updates the
 * same note in place. Every other key — the event's own and anything a user or
 * another tool added — is left untouched.
 */
export function serializeManagedEventMarkdown(
    event: NeoEvent,
    metadata: ManagedEventMetadata,
    previousContents = ""
): string {
    const base = serializeEventMarkdown(event, previousContents);
    const document = extractFrontmatter(base);
    if (!document) {
        // serializeEventMarkdown always emits frontmatter; this is unreachable.
        throw new Error("The serialized event note has no frontmatter.");
    }

    const kept = document.lines.filter((line) => {
        const colon = line.indexOf(":");
        if (colon <= 0) return true;
        return !MANAGED_KEY_SET.has(line.slice(0, colon).trim());
    });

    const lines = [...kept, ...managedLines(metadata)];
    return `---\n${lines.join("\n")}\n---\n${document.body}`;
}

function nonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim() !== "";
}

/**
 * Read the managed metadata back, or `null` when the note is not a managed one.
 *
 * A partial marker set is rejected outright: a note that names a manager but is
 * missing an identifier can never be matched to a feed occurrence, so treating
 * it as unmanaged is safer than acting on half of it.
 */
export function managedMetadataFromMarkdown(
    contents: string
): ManagedEventMetadata | null {
    const raw = parseFrontmatter(contents);
    if (!raw || raw.neoManagedBy !== "neo-calendar:ics") return null;

    const recurrenceOk =
        "neoIcsRecurrenceId" in raw &&
        (raw.neoIcsRecurrenceId === null ||
            nonEmptyString(raw.neoIcsRecurrenceId));

    if (
        raw.neoManagedVersion !== 1 ||
        !nonEmptyString(raw.neoIcsFeedId) ||
        !nonEmptyString(raw.neoIcsUid) ||
        !recurrenceOk ||
        raw.neoIcsStatus !== "confirmed"
    ) {
        return null;
    }

    return {
        neoManagedBy: "neo-calendar:ics",
        neoManagedVersion: 1,
        neoIcsFeedId: raw.neoIcsFeedId,
        neoIcsUid: raw.neoIcsUid,
        neoIcsRecurrenceId:
            raw.neoIcsRecurrenceId === null
                ? null
                : (raw.neoIcsRecurrenceId as string),
        neoIcsStatus: "confirmed",
    };
}

/** Whether a note is a managed ICS note owned by the given feed. */
export function isManagedBy(contents: string, feedId: string): boolean {
    const metadata = managedMetadataFromMarkdown(contents);
    return (
        metadata?.neoManagedBy === "neo-calendar:ics" &&
        metadata.neoIcsFeedId === feedId
    );
}
