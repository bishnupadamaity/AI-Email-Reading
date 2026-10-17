import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'sm' | 'xs';

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  iconOnly?: boolean;
  block?: boolean;
  loading?: boolean;
}

function classes({
  variant = 'secondary',
  size = 'md',
  iconOnly,
  block,
  className,
}: CommonProps & { className?: string }): string {
  return [
    'btn',
    `btn--${variant}`,
    size !== 'md' ? `btn--${size}` : '',
    iconOnly ? 'btn--icon' : '',
    block ? 'btn--block' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
}

export type ButtonProps = CommonProps & ButtonHTMLAttributes<HTMLButtonElement>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, icon, iconOnly, block, loading, children, className, disabled, ...rest },
  ref,
) {
  return (
    <button
      {...rest}
      ref={ref}
      disabled={disabled ?? loading}
      className={classes({ variant, size, iconOnly, block, className })}
    >
      {loading ? <span className="btn__spinner" aria-hidden="true" /> : icon}
      {!iconOnly && children}
    </button>
  );
});

export type ButtonLinkProps = CommonProps & LinkProps;

export function ButtonLink({
  variant,
  size,
  icon,
  iconOnly,
  block,
  children,
  className,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link {...rest} className={classes({ variant, size, iconOnly, block, className })}>
      {icon}
      {!iconOnly && children}
    </Link>
  );
}
