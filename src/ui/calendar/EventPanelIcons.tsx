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

   These are drawn here rather than taken from a set, because the icon library
   this project uses ships no brand marks. That sets an honest limit: a shape
   is only used where the real mark IS simple geometry — a play triangle in a
   rounded rectangle, a camera outline with a circle in it, a ring with three
   arcs. Where it is not, the link gets the globe rather than a bad drawing
   pretending to be a logo. */

const brand = (color: string) => ({ color });

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
        <path d="M2.6 6.2h10.8M2.6 9.8h10.8" stroke="currentColor" strokeWidth="1.3" />
    </svg>
);

/** The vault's own mark is a faceted gem; this is that shape, in its colour. */
export const VaultIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={brand("#a68cf0")}>
        <path
            d="M8 1.8 13 5v6L8 14.2 3 11V5z"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
        />
        <path
            d="M8 1.8 5.6 8 8 14.2M13 5 5.6 8M3 5l2.6 3"
            stroke="currentColor"
            strokeWidth="1.1"
            strokeLinejoin="round"
        />
    </svg>
);

export const YoutubeIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={brand("#ff0033")}>
        <rect
            x="1.4"
            y="3.4"
            width="13.2"
            height="9.2"
            rx="2.8"
            fill="currentColor"
        />
        <path d="M6.6 6.2 10.6 8l-4 1.8z" fill="#fff" />
    </svg>
);

export const InstagramIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={brand("#e1306c")}>
        <rect
            x="2.2"
            y="2.2"
            width="11.6"
            height="11.6"
            rx="3.4"
            stroke="currentColor"
            strokeWidth="1.4"
        />
        <circle cx="8" cy="8" r="2.9" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="11.5" cy="4.5" r="0.85" fill="currentColor" />
    </svg>
);

/** Named for the site, not for the shape: XIcon is already the close button. */
export const XSiteIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
            d="M3.4 3.4 12.6 12.6M12.6 3.4 3.4 12.6"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
        />
    </svg>
);

export const SpotifyIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={brand("#1db954")}>
        <circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.4" />
        <path
            d="M4.9 6.2c2-.5 4.2-.3 6.1.7M5.4 8.4c1.6-.4 3.4-.2 4.9.6M5.9 10.5c1.2-.3 2.6-.2 3.7.5"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
        />
    </svg>
);

export const WhatsappIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={brand("#25d366")}>
        <path
            d="M2.6 13.4l.8-2.7A5.5 5.5 0 1 1 5.6 12.8z"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
        />
        <path
            d="M6.2 6c.3 1.9 1.9 3.5 3.8 3.8l.7-1 1.2.6-.3 1.1c-2.6.4-5.4-2.4-5.1-5l1.1-.3.6 1.2z"
            fill="currentColor"
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
