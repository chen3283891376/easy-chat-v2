import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

export const formatTime = (timestamp: number) => {
    const milliseconds =
        timestamp.toString().length === 10 ? timestamp * 1000 : timestamp
    return new Date(milliseconds)
}
