import { signMessage, signRaw } from './ed25519';
import { genNonce } from './utils';

type Auth = { username: string; privateKey: string } | undefined;

export const storage = {
    get: async (key: string) => {
        const response = await fetch(`/api/get?key=${key}`);
        if (response.ok) {
            const data = await response.json();
            return data.data;
        } else {
            throw new Error('Failed to get value from storage');
        }
    },
    new: async (key: string, value: any, auth?: Auth) => {
        const body: any = { key, value };
        if (auth) {
            const time = Math.floor(Date.now() / 1000);
            const nonce = genNonce();
            const msg = `${key}|${JSON.stringify(value)}`;
            const sig = await signMessage(msg, auth.username, time, auth.privateKey, nonce);

            body.username = auth.username;
            body.time = time;
            body.sig = sig;
            body.nonce = nonce;
        }
        const response = await fetch('/api/new', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (response.status === 401) { localStorage.clear(); location.reload(); return; }
        if (!response.ok) throw new Error('Failed to create new variable');
    },

    set: async (key: string, value: any, auth?: Auth) => {
        const body: any = { key, value };
        if (auth) {
            const time = Math.floor(Date.now() / 1000);
            const nonce = genNonce();
            const msg = `${key}|${JSON.stringify(value)}`;
            const sig = await signMessage(msg, auth.username, time, auth.privateKey, nonce);

            body.username = auth.username;
            body.time = time;
            body.sig = sig;
            body.nonce = nonce;
        }
        const response = await fetch('/api/set', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!response.ok) throw new Error('Failed to set value in storage');
    },

    append: async (key: string, value: any, auth?: Auth) => {
        let payload;
        if (auth) {
            const time = Math.floor(Date.now() / 1000);
            const nonce = genNonce();
            const msg = `${key}|${value}`;
            const sig = await signMessage(msg, auth.username, time, auth.privateKey, nonce);

            payload = JSON.stringify({
                key,
                value,
                username: auth.username,
                time,
                sig,
                nonce,
            })
        }
        const response = await fetch('/api/append', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload });
        if (!response.ok) throw new Error('Failed to append value in storage');
    },
    getRooms: async (_username: string, _auth?: Auth) => { },
    setRooms: async (_username: string, _newRooms: string, _auth?: Auth) => { },
};

// Rooms API: 获取用户保存的房间列表
storage.getRooms = async (username: string, auth?: Auth) => {
    if (!auth) throw new Error('Auth required');
    const time = Math.floor(Date.now() / 1000);
    const nonce = genNonce();
    const payload = `${time}|${nonce}`;
    const sig = await signRaw(payload, auth.privateKey);

    const url = `/api/auth/rooms/${encodeURIComponent(username)}?sig=${sig}&timestamp=${time}&nonce=${nonce}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to get rooms');
    const d = await res.json();
    return d.data;
};

// Rooms API: 保存用户房间列表
storage.setRooms = async (username: string, newRooms: string, auth?: Auth) => {
    if (!auth) throw new Error('Auth required');
    const time = Math.floor(Date.now() / 1000);
    const nonce = genNonce();
    const payload = `${newRooms}|${time}|${nonce}`;
    const sig = await signRaw(payload, auth.privateKey);

    const body = { username, sig, timestamp: String(time), nonce, newRooms } as any;
    const res = await fetch(`/api/auth/rooms/${encodeURIComponent(username)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('Failed to set rooms');
    return;
};
