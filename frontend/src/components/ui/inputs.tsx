import { Search, X } from 'lucide-react';
import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { Button } from './Button';

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search',
  label,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label: string;
  autoFocus?: boolean;
}) {
  const id = useId();

  return (
    <div className="search">
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <span className="search__icon">
        <Search size={14} aria-hidden="true" />
      </span>
      <input
        id={id}
        className="input"
        type="search"
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
      />
      {value ? (
        <span className="search__clear">
          <Button
            variant="ghost"
            size="xs"
            iconOnly
            icon={<X size={13} aria-hidden="true" />}
            onClick={() => onChange('')}
            aria-label="Clear search"
          />
        </span>
      ) : null}
    </div>
  );
}

export interface SelectOption {
  value: string;
  label: string;
}

export function Select({
  label,
  options,
  hideLabel,
  ...rest
}: {
  label: string;
  options: readonly SelectOption[];
  hideLabel?: boolean;
} & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();

  return (
    <div className={hideLabel ? '' : 'field'}>
      <label className={hideLabel ? 'sr-only' : 'field__label'} htmlFor={id}>
        {label}
      </label>
      <select id={id} className="select" {...rest}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function TextInput({
  label,
  hint,
  error,
  hideLabel,
  ...rest
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  hideLabel?: boolean;
} & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();

  return (
    <div className="field">
      <label className={hideLabel ? 'sr-only' : 'field__label'} htmlFor={id}>
        {label}
      </label>
      <input id={id} className="input" aria-invalid={error ? true : undefined} {...rest} />
      {error ? (
        <p className="field__error">{error}</p>
      ) : hint ? (
        <p className="field__hint">{hint}</p>
      ) : null}
    </div>
  );
}

export function TextArea({
  label,
  hint,
  error,
  rows = 6,
  ...rest
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
} & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        className="textarea"
        rows={rows}
        aria-invalid={error ? true : undefined}
        {...rest}
      />
      {error ? (
        <p className="field__error">{error}</p>
      ) : hint ? (
        <p className="field__hint">{hint}</p>
      ) : null}
    </div>
  );
}

export interface FilterTab<Value extends string> {
  value: Value;
  label: string;
  count?: number;
}

/** Tab-styled filter set used by the inbox and the queues. */
export function FilterTabs<Value extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: readonly FilterTab<Value>[];
  value: Value;
  onChange: (value: Value) => void;
  label: string;
}) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          className="tab"
          aria-selected={tab.value === value}
          onClick={() => onChange(tab.value)}
        >
          {tab.label}
          {tab.count === undefined ? null : <span className="tab__count">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Segmented<Value extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: Value; label: string }[];
  value: Value;
  onChange: (value: Value) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="segmented__option"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className="switch">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="switch__track" aria-hidden="true">
        <span className="switch__thumb" />
      </span>
      <span>{label}</span>
    </label>
  );
}
