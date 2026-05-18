import { ChevronDown } from 'lucide-react'

export function Select({ className = '', children, ...props }) {
  return (
    <span className="relative block">
      <select
        className={[
          'h-10 w-full appearance-none rounded-ui border border-ui-border bg-ui-surface px-3 pr-10 text-sm text-ui-text shadow-sm',
          'transition duration-150 hover:border-brand-primary/50',
          'focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20',
          'disabled:cursor-not-allowed disabled:bg-ui-bg disabled:opacity-60',
          className
        ].join(' ')}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        size={16}
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ui-muted"
      />
    </span>
  )
}
