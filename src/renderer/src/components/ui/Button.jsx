const variants = {
  primary: 'bg-brand-primary text-white hover:-translate-y-0.5 hover:brightness-95 hover:shadow-ui',
  secondary: 'bg-brand-secondary text-white hover:-translate-y-0.5 hover:brightness-95 hover:shadow-ui',
  danger: 'bg-brand-danger text-white hover:-translate-y-0.5 hover:brightness-95 hover:shadow-ui',
  ghost: 'bg-transparent text-ui-text hover:bg-ui-bg hover:text-brand-primary'
}

const sizes = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-5 text-base'
}

export function Button({
  type = 'button',
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}) {
  return (
    <button
      type={type}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-ui font-medium transition duration-150',
        'focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        sizes[size],
        className
      ].join(' ')}
      {...props}
    >
      {children}
    </button>
  )
}
