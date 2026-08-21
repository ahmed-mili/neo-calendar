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
/*
 * La fleche qui revient sur elle-meme, telle qu'Ahmed l'a fournie.
 *
 * Un trace plein plutot que deux traits : le dessin d'origine est une
 * silhouette, et la redessiner au trait en aurait fait une autre icone.
 * `currentColor` remplace la couleur figee du fichier pour qu'elle suive
 * la ligne ou elle est posee — la meme icone sert de puce a la ligne de
 * repetition, ou le texte est tantot vif tantot en retrait.
 *
 * Le viewBox est resserre sur le glyphe : le fichier le pose au milieu
 * d'un carre de 1536, et laisse tel quel il serait dessine trois fois plus
 * petit que les icones voisines.
 */
export const RepeatIcon = () => (
    <svg width="16" height="16" viewBox="563 559 406 400">
        <path
            d="M 959 563 L 919 563 L 915 566 L 915 616 L 913 625 L 911 627 L 896 612 L 892 610 L 887 604 L 884 603 L 880 598 L 870 594 L 866 590 L 856 586 L 850 581 L 839 578 L 832 573 L 819 571 L 806 566 L 791 565 L 790 564 L 773 564 L 772 563 L 745 563 L 744 564 L 733 565 L 720 570 L 705 572 L 696 578 L 688 580 L 682 583 L 679 586 L 669 589 L 661 595 L 655 597 L 651 602 L 644 606 L 641 610 L 636 613 L 622 627 L 619 632 L 612 639 L 611 642 L 606 646 L 603 653 L 597 660 L 595 667 L 590 673 L 586 686 L 582 691 L 580 697 L 579 708 L 574 721 L 573 731 L 572 732 L 572 754 L 571 755 L 572 759 L 572 786 L 573 787 L 574 797 L 578 806 L 581 824 L 587 834 L 588 841 L 591 847 L 594 850 L 598 861 L 603 866 L 606 873 L 611 877 L 612 880 L 619 887 L 622 892 L 636 906 L 640 908 L 644 913 L 650 916 L 654 921 L 661 924 L 667 929 L 675 931 L 682 936 L 688 939 L 694 940 L 706 947 L 716 948 L 739 955 L 794 955 L 804 953 L 807 951 L 818 948 L 823 948 L 836 945 L 841 941 L 848 939 L 858 932 L 865 930 L 871 925 L 879 922 L 901 903 L 902 894 L 876 868 L 872 866 L 866 867 L 853 880 L 843 884 L 837 889 L 826 892 L 819 897 L 805 900 L 799 904 L 787 905 L 786 906 L 738 905 L 729 900 L 715 897 L 708 892 L 700 890 L 690 883 L 682 880 L 661 861 L 660 858 L 655 854 L 652 848 L 646 842 L 642 833 L 638 829 L 635 820 L 630 813 L 627 796 L 623 788 L 622 775 L 621 774 L 621 757 L 620 756 L 621 755 L 622 731 L 627 721 L 630 705 L 635 699 L 638 689 L 643 684 L 646 677 L 651 672 L 654 666 L 660 661 L 661 658 L 682 639 L 693 634 L 697 630 L 708 627 L 715 622 L 729 619 L 738 614 L 771 612 L 772 613 L 790 614 L 799 618 L 816 621 L 827 627 L 838 630 L 843 635 L 852 639 L 869 653 L 881 666 L 882 669 L 887 674 L 891 681 L 886 686 L 795 686 L 792 689 L 792 731 L 796 735 L 960 735 L 964 730 L 964 568 Z"
            fill="currentColor"
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
/** Une flèche qui revient sur elle-même : redemander ce que le lien dit de lui,
    quand le réseau n'a pas répondu la première fois. */
export const ReloadIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
            d="M13.2 8a5.2 5.2 0 1 1-1.53-3.68"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
        />
        <path
            d="M13.2 2.4v3.1h-3.1"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
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
