import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';

ed.hashes.sha512 = sha512;

export function toHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

export function fromHex(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
}

// 生成密钥对
export async function generateKeyPair() {
    const { secretKey, publicKey } = await ed.keygenAsync();
    return {
        privateKey: toHex(secretKey),
        publicKey: toHex(publicKey),
    };
}

// 签名消息
export async function signMessage(msg: string, username: string, time: number, privateKeyHex: string, nonce: string) {
    const data = new TextEncoder().encode(`${username}|${msg}|${time}|${nonce}`);
    const sig = await ed.signAsync(data, fromHex(privateKeyHex));
    return toHex(sig);
}

// 签名任意负载（不加入 username/time/nonce 前缀）
export async function signRaw(payload: string, privateKeyHex: string) {
    const data = new TextEncoder().encode(payload);
    const sig = await ed.signAsync(data, fromHex(privateKeyHex));
    return toHex(sig);
}

// 验签
export async function verifyMessage(
    msg: string,
    username: string,
    time: number,
    sigHex: string,
    publicKeyHex: string,
    nonce: string,
) {
    try {
        const data = new TextEncoder().encode(`${username}|${msg}|${time}|${nonce}`);
        return await ed.verifyAsync(fromHex(sigHex), data, fromHex(publicKeyHex));
    } catch {
        return false;
    }
}
