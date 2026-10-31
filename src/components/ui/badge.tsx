import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/cn.ts'

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'inline-flex min-w-5 items-center justify-center rounded-full bg-blood px-1.5 py-0.5 text-[10px] font-semibold leading-none text-ink',
        className,
      )}
      {...props}
    />
  )
}
