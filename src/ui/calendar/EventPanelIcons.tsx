import * as React from "react";

export const DocIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
            d="M4 2.5h5l3 3V13a0.5 0.5 0 0 1-0.5 0.5h-7.5A0.5 0.5 0 0 1 3.5 13V3a0.5 0.5 0 0 1 0.5-0.5z"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
        />
        <path
            d="M9 2.5V5.5H12"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
        />
    </svg>
);
export const CalendarIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect
            x="2.5"
            y="3.5"
            width="11"
            height="10"
            rx="1.5"
            stroke="currentColor"
            strokeWidth="1.3"
        />
        <path
            d="M2.5 6.5h11M5.5 2v3M10.5 2v3"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
        />
    </svg>
);
/* Lucide "bell", drawn on its own 24 grid rather than the 16 the icons
   above use: it is the shape the reference shows on this field, and
   redrawing it by hand at 16 would be a lookalike rather than the icon. */
export const BellIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path
            d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        <path
            d="M10.3 21a1.94 1.94 0 0 0 3.4 0"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
);
export const ClockIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.3" />
        <path
            d="M8 5v3l2 1.5"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
);
export const FolderIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
            d="M2.5 4.5A1 1 0 0 1 3.5 3.5h3l1.5 1.5h4.5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1v-7z"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
        />
    </svg>
);
export const CheckIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.3" />
        <path
            d="M5.5 8l1.75 1.75L10.5 6.5"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
);
/** A list whose lines are ticked off: the steps a task is made of. */
export const ChecklistIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
            d="M2.5 4.5l1.25 1.25L6.25 3.25M2.5 11l1.25 1.25L6.25 9.75"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        <path
            d="M8.5 4.75h5M8.5 11.25h5"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
        />
    </svg>
);
export const PlusIcon = () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <path
            d="M8 3.5v9M3.5 8h9"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
        />
    </svg>
);
export const LinesIcon = () => (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
        <path
            d="M3 4.5h10M3 8h10M3 11.5h7"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
        />
    </svg>
);
export const RepeatIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
            d="M4 5.5h6a2.5 2.5 0 0 1 2.5 2.5v.5M12 10.5H6a2.5 2.5 0 0 1-2.5-2.5V7.5"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        <path
            d="M5.5 4L4 5.5 5.5 7M10.5 9 12 10.5 10.5 12"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
);
export const DotsIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="4" cy="8" r="1.3" fill="currentColor" />
        <circle cx="8" cy="8" r="1.3" fill="currentColor" />
        <circle cx="12" cy="8" r="1.3" fill="currentColor" />
    </svg>
);
export const XIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
            d="M4 4l8 8M12 4l-8 8"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
        />
    </svg>
);
/** Un crayon : renommer ce que la ligne montre. */
export const PencilIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
            d="M11.2 2.8a1.4 1.4 0 0 1 2 2L6.4 11.6 3.5 12.5l.9-2.9 6.8-6.8z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
        />
    </svg>
);
export const FileTextIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
            d="M4 2.5h4.5L12 6v7a.5.5 0 0 1-.5.5h-7A.5.5 0 0 1 4 13V3a.5.5 0 0 1 .5-.5z"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
        />
        <path
            d="M8.25 2.5V6.25H12"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
        />
        <path
            d="M6 9.25h4M6 11.25h2.5"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
        />
    </svg>
);
export const ArrowRightIcon = () => (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <path
            d="M3 8h9M9 5l3 3-3 3"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
);

/* ── Where a link goes ────────────────────────────────────────
   Every linked row wore the same document icon, so a note in the vault, a
   video and an email address looked alike until you read the text.

   The brands live in BrandIcons.tsx, as their real marks. What is left here is
   the three destinations that belong to nobody: a website, an address, a
   number. */

export const GlobeIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="5.6" stroke="currentColor" strokeWidth="1.3" />
        <ellipse
            cx="8"
            cy="8"
            rx="2.4"
            ry="5.6"
            stroke="currentColor"
            strokeWidth="1.3"
        />
        <path
            d="M2.6 6.2h10.8M2.6 9.8h10.8"
            stroke="currentColor"
            strokeWidth="1.3"
        />
    </svg>
);

export const MailIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect
            x="2"
            y="3.6"
            width="12"
            height="8.8"
            rx="1.6"
            stroke="currentColor"
            strokeWidth="1.3"
        />
        <path
            d="m2.6 5 5.4 3.6L13.4 5"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
        />
    </svg>
);

export const PhoneIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
            d="M5.6 2.6 7 5.2 5.7 6.6a7 7 0 0 0 3.7 3.7l1.4-1.3 2.6 1.4-.4 2A1.2 1.2 0 0 1 11.8 13 9.8 9.8 0 0 1 3 4.2 1.2 1.2 0 0 1 3.6 3z"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
        />
    </svg>
);
