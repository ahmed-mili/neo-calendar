import React from "react";
import { Check, ChevronRight } from "lucide-react";

/**
 * The building blocks of the settings screen.
 *
 * One shape repeats all the way down: an icon, a label, and what the setting is
 * currently set to. Rows are stacked into groups so the eye can take the screen
 * in as a handful of blocks instead of one long column of unrelated controls —
 * which is what the previous screen was, and why nothing on it was findable.
 */

interface SettingsGroupProps {
    /** Shown above the block. Omitted for a block that needs no introduction. */
    title?: string;
    children: React.ReactNode;
}

export function SettingsGroup({ title, children }: SettingsGroupProps) {
    return (
        <section className="nc-set-group" aria-label={title || undefined}>
            {title && <h3 className="nc-set-group__title">{title}</h3>}
            <div className="nc-set-group__rows">{children}</div>
        </section>
    );
}

export interface SettingsRowProps {
    label: string;
    /** What the setting is currently set to, read under the label. */
    value?: React.ReactNode;
    icon?: React.ReactNode;
    /** Shown at the right edge: a toggle, a chevron, a badge. */
    trailing?: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
}

export function SettingsRow({
    label,
    value,
    icon,
    trailing,
    onClick,
    disabled,
}: SettingsRowProps) {
    const content = (
        <>
            {icon && <span className="nc-set-row__icon">{icon}</span>}
            <span className="nc-set-row__text">
                <span className="nc-set-row__label">{label}</span>
                {value !== undefined && value !== null && value !== "" && (
                    <span className="nc-set-row__value">{value}</span>
                )}
            </span>
            {trailing && (
                <span className="nc-set-row__trailing">{trailing}</span>
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
    value?: React.ReactNode;
    icon?: React.ReactNode;
    checked: boolean;
    onChange: (checked: boolean) => void;
}

export function SettingsToggleRow({
    label,
    value,
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
            <span className="nc-set-row__text">
                <span className="nc-set-row__label">{label}</span>
                {value && <span className="nc-set-row__value">{value}</span>}
            </span>
            <span className="nc-set-switch" aria-hidden="true">
                <span className="nc-set-switch__knob" />
            </span>
        </button>
    );
}

export interface ChoiceOption<T extends string> {
    value: T;
    label: string;
    icon?: React.ReactNode;
}

interface SettingsChoiceRowProps<T extends string> {
    label: string;
    value: T;
    options: ChoiceOption<T>[];
    icon?: React.ReactNode;
    onChange: (value: T) => void;
}

/**
 * A row that opens a short list of choices.
 *
 * The row reads the chosen option by its label — a person picked "Lundi", not
 * the number 1, and that is what should be read back.
 */
export function SettingsChoiceRow<T extends string>({
    label,
    value,
    options,
    icon,
    onChange,
}: SettingsChoiceRowProps<T>) {
    const [open, setOpen] = React.useState(false);
    const selected = options.find((option) => option.value === value);

    return (
        <>
            <SettingsRow
                label={label}
                value={selected?.label}
                icon={icon}
                trailing={<ChevronRight size={17} />}
                onClick={() => setOpen(true)}
            />
            {open && (
                <ChoiceSheet
                    title={label}
                    value={value}
                    options={options}
                    onPick={(next) => {
                        onChange(next);
                        setOpen(false);
                    }}
                    onDismiss={() => setOpen(false)}
                />
            )}
        </>
    );
}

interface ChoiceSheetProps<T extends string> {
    title: string;
    value: T;
    options: ChoiceOption<T>[];
    onPick: (value: T) => void;
    onDismiss: () => void;
}

export function ChoiceSheet<T extends string>({
    title,
    value,
    options,
    onPick,
    onDismiss,
}: ChoiceSheetProps<T>) {
    React.useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") onDismiss();
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [onDismiss]);

    return (
        <div className="nc-set-sheet" role="dialog" aria-label={title}>
            <button
                type="button"
                className="nc-set-sheet__scrim"
                aria-label="Fermer"
                onClick={onDismiss}
            />
            <div className="nc-set-sheet__panel" role="listbox">
                <p className="nc-set-sheet__title">{title}</p>
                {options.map((option) => (
                    <button
                        key={option.value}
                        type="button"
                        role="option"
                        aria-selected={option.value === value}
                        className="nc-set-sheet__option"
                        onClick={() => onPick(option.value)}
                    >
                        {option.icon && (
                            <span className="nc-set-sheet__icon">
                                {option.icon}
                            </span>
                        )}
                        <span>{option.label}</span>
                        {option.value === value && (
                            <Check size={17} className="nc-set-sheet__check" />
                        )}
                    </button>
                ))}
            </div>
        </div>
    );
}
