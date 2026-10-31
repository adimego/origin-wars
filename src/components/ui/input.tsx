import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/cn.ts'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'flex h-9 w-full rounded-md border border-line bg-ink px-3 text-sm text-parchment placeholder:text-faint',
        className,
      )}
      {...props}
    />
  )
}
