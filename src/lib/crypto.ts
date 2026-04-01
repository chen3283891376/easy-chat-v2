const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function generateKeyFromNumber(
    keyNumber: number | string,
): Promise<CryptoKey> {
    const keyStr = String(keyNumber);
    const hash = await crypto.subtle.digest('SHA-256', encoder.encode(keyStr));
    const keyMaterial = new Uint8Array(hash);
    return await crypto.subtle.importKey(
        'raw',
        keyMaterial,
        { name: 'AES-CBC' },
        false,
        ['encrypt', 'decrypt'],
    );
}

const fixedIv = encoder.encode('0000000000000000');

async function encrypt(
    plaintext: string,
    keyNumber: number | string,
): Promise<string> {
    const key = await generateKeyFromNumber(keyNumber);
    const data = encoder.encode(plaintext);

    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-CBC', iv: fixedIv },
        key,
        data,
    );

    return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
}

async function decrypt(
    ciphertext: string,
    keyNumber: number | string,
): Promise<string> {
    const key = await generateKeyFromNumber(keyNumber);
    const binary = atob(ciphertext);
    const bytes = new Uint8Array([...binary].map((c) => c.charCodeAt(0)));

    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-CBC', iv: fixedIv },
        key,
        bytes,
    );

    return decoder.decode(decrypted);
}

export { encrypt, decrypt };
