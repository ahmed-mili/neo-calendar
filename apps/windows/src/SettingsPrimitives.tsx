import React from "react";
import { ChevronRight } from "lucide-react";

/**
 * The building blocks of the settings screen.
 *
 * One shape repeats all the way down: a label on the left, what the setting is
 * currently set to on the right, and a chevron when there is somewhere to go.
 * Rows are stacked into groups so the eye can take the screen in as a handful
 * of blocks instead of one long column of unrelated controls — which is what
 * the previous screen was, and why nothing on it was findable.
 *
 * A row says what it is, never how it works: explanations belong under the
 * block as a note, where they can run to two lines without pushing every row
 * apart and without being cut off mid-sentence.
 */

interface SettingsGroupProps {
    /** Shown above the block, quiet and in sentence case. */
    title?: string;
    /** Shown under the block, for the one thing a label cannot say. */
    note?: React.ReactNode;
    children: React.ReactNode;
}

export function SettingsGroup({ title, note, children }: SettingsGroupProps) {
    return (
        <section className="nc-set-group" aria-label={title || undefined}>
            {title && <h3 className="nc-set-group__title">{title}</h3>}
            <div className="nc-set-group__rows">{children}</div>
            {note && <p className="nc-set-group__note">{note}</p>}
        </section>
    );
}

export interface SettingsRowProps {
    label: string;
    /** What the setting is currently set to, read at the right edge. */
    value?: React.ReactNode;
    icon?: React.ReactNode;
    /** Shown at the far right: a chevron, a toggle, a badge. */
    trailing?: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    /** Marks a row that leaves for somewhere else, so it gets a chevron. */
    navigates?: boolean;
}

export function SettingsRow({
    label,
    value,
    icon,
    trailing,
    onClick,
    disabled,
    navigates,
}: SettingsRowProps) {
    const content = (
        <>
            {icon && <span className="nc-set-row__icon">{icon}</span>}
            <span className="nc-set-row__label">{label}</span>
            {value !== undefined && value !== null && value !== "" && (
                <span className="nc-set-row__value">{value}</span>
            )}
            {(trailing || navigates) && (
                <span className="nc-set-row__trailing">
                    {trailing ?? <ChevronRight size={18} />}
                </span>
            )}
        </>
    );

    // A row that does nothing is not a button: making it one would promise an
    // action that never comes, and put it in the keyboard order for nothing.
    if (!onClick) {
        return <div className="nc-set-row">{content}</div>;
    }

    return (
        <button
            type="button"
            className="nc-set-row nc-set-row--action"
            onClick={onClick}
            disabled={disabled}
        >
            {content}
        </button>
    );
}

interface SettingsToggleRowProps {
    label: string;
    icon?: React.ReactNode;
    checked: boolean;
    onChange: (checked: boolean) => void;
}

export function SettingsToggleRow({
    label,
    icon,
    checked,
    onChange,
}: SettingsToggleRowProps) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            className="nc-set-row nc-set-row--action"
            onClick={() => onChange(!checked)}
        >
            {icon && <span className="nc-set-row__icon">{icon}</span>}
            <span className="nc-set-row__label">{label}</span>
            <span className="nc-set-row__trailing">
                <span className="nc-set-switch" aria-hidden="true">
                    <span className="nc-set-switch__knob" />
                </span>
            </span>
        </button>
    );
}

export interface ChoiceOption<T extends string> {
    value: T;
    label: string;
    icon?: React.ReactNode;
}

/**
 * A row that reads its chosen option and hands the list to whoever knows how
 * to show it — here, the settings stack, which opens it as its own page.
 *
 * The row reads the chosen option by its label: a person picked "Lundi", not
 * the number 1, and that is what should be read back.
 */
interface SettingsChoiceRowProps<T extends string> {
    label: string;
    value: T;
    options: ChoiceOption<T>[];
    icon?: React.ReactNode;
    onOpen: (choice: {
        title: string;
        value: string;
        options: ChoiceOption<string>[];
        onPick: (value: string) => void;
    }) => void;
    onChange: (value: T) => void;
}

export function SettingsChoiceRow<T extends string>({
    label,
    value,
    options,
    icon,
    onOpen,
    onChange,
}: SettingsChoiceRowProps<T>) {
    const selected = options.find((option) => option.value === value);

    return (
        <SettingsRow
            label={label}
            value={selected?.label}
            icon={icon}
            navigates
            onClick={() =>
                onOpen({
                    title: label,
                    value,
                    options,
                    onPick: (next) => onChange(next as T),
                })
            }
        />
    );
}
