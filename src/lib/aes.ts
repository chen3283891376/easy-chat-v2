import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { gcm } from '@noble/ciphers/aes.js';
import { randomBytes } from '@noble/hashes/utils.js';

// ==============================
// 安全方案：PBKDF2-HMAC-SHA256 + AES-GCM
// ==============================

export function encryptPrivateKey(privateKey: string, password: string): string {
    const salt = randomBytes(16);
    const iv = randomBytes(12);

    const key = pbkdf2(sha256, password, salt, {
        c: 210000,
        dkLen: 32,
    });

    const data = new TextEncoder().encode(privateKey);
    const cipher = gcm(key, iv).encrypt(data);

    return `${hex(salt)}:${hex(iv)}:${hex(cipher)}`;
}

export function decryptPrivateKey(encryptedStr: string, password: string): string | null {
    try {
        const parts = encryptedStr.split(':');
        if (parts.length !== 3) return null;

        const salt = unhex(parts[0]);
        const iv = unhex(parts[1]);
        const cipher = unhex(parts[2]);

        const key = pbkdf2(sha256, password, salt, {
            c: 210000,
            dkLen: 32,
        });

        const plain = gcm(key, iv).decrypt(cipher);
        return new TextDecoder().decode(plain);
    } catch {
        return null;
    }
}

// ==============================
// 工具函数
// ==============================
function hex(buf: Uint8Array): string {
    return Array.from(buf, b => b.toString(16).padStart(2, '0')).join('');
}

function unhex(s: string): Uint8Array {
    const buf = new Uint8Array(s.length >> 1);
    for (let i = 0; i < buf.length; i++) {
        buf[i] = parseInt(s.substr(i << 1, 2), 16);
    }
    return buf;
}