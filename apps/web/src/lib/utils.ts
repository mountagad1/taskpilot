import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * The standard shadcn/ui class merger. clsx resolves conditionals and
 * arrays; twMerge then drops earlier Tailwind classes that conflict with
 * later ones, so a caller can override a component's base classes just by
 * passing the class they want (e.g. `skew-y-0` beats a base `-skew-y-[8deg]`).
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
