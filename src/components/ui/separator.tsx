import { Separator as SeparatorPrimitive } from '@radix-ui/react-separator'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn.ts'

export function Separator({ className, orientation = 'horizontal', ...props }: ComponentProps<typeof SeparatorPrimitive>) {
  return (
    <SeparatorPrimitive
      orientation={orientation}
      className={cn(orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px', 'bg-line', className)}
      {...props}
    />
  )
}
