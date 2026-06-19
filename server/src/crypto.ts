import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";

ed.hashes.sha512 = sha512;

// hex转Uint8Array
export function fromHex(hex: string) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    return bytes;
}

// Nonce 防重集合，60s 自动清空
export const usedNonce = new Set<string>();
setInterval(() => {
    usedNonce.clear();
}, 60 * 1000);

// 统一时间校验工具
export function checkTimeWindow(timestamp: number | string, windowSec = 10) {
    const now = Math.floor(Date.now() / 1000);
    const ts = typeof timestamp === "string" ? parseInt(timestamp) : timestamp;
    return Math.abs(now - ts) <= windowSec;
}
