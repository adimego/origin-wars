import { BrickWall, Pickaxe, Trees } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Resources } from '@/game/config/ids.ts'
import { formatCount } from './format.ts'

export function Panel({
  title,
  action,
  children,
  className = '',
}: {
  title?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`rounded-lg border border-line bg-panel ${className}`}>
      {title ? (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="font-display text-sm tracking-wide text-brass-2">{title}</h2>
          {action}
        </header>
      ) : null}
      <div className="p-4">{children}</div>
    </section>
  )
}

export function CostLine({ cost }: { cost: Resources }) {
  return (
    <span className="num inline-flex flex-wrap gap-x-3 gap-y-1 text-xs">
      <span className="text-wood">{formatCount(cost.wood)} wood</span>
      <span className="text-clay">{formatCount(cost.clay)} clay</span>
      <span className="text-iron">{formatCount(cost.iron)} iron</span>
    </span>
  )
}

export function ResourceIcon({ kind, className = 'h-3.5 w-3.5' }: { kind: 'wood' | 'clay' | 'iron'; className?: string }) {
  if (kind === 'wood') return <Trees className={`${className} text-wood`} />
  if (kind === 'clay') return <BrickWall className={`${className} text-clay`} />
  return <Pickaxe className={`${className} text-iron`} />
}
