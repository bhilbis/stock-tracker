export function Card({ className = '', children }) {
  return (
    <section className={['rounded-ui border border-ui-border bg-ui-surface p-5 shadow-ui', className].join(' ')}>
      {children}
    </section>
  )
}
