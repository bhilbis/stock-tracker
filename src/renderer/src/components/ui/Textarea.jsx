export function Textarea({ className = '', ...props }) {
  return (
    <textarea
      className={[
        'min-h-24 w-full resize-y rounded-ui border border-ui-border bg-ui-surface px-3 py-2 text-sm text-ui-text',
        'placeholder:text-ui-muted focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      ].join(' ')}
      {...props}
    />
  )
}
