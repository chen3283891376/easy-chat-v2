import { randomBytes } from '@noble/hashes/utils.js';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function genNonce() {
    return Array.from(randomBytes(16))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}