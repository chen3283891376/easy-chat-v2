/* eslint-disable @typescript-eslint/no-explicit-any */
import { fromHex, signMessage, signRaw, toHex } from './ed25519';
import * as ed from '@noble/ed25519';
import { genNonce } from './utils';

type Auth = { username: string; privateKey: string } | undefined;

export const storage = {
    get: async (key: string, auth?: Auth) => {
        if (!auth) throw new Error('Auth required');
        const time = Math.floor(Date.now() / 1000);
        const nonce = genNonce();
        const msg = `${key}|${time}|${nonce}`;
        const sig = await ed.signAsync(new TextEncoder().encode(msg), fromHex(auth.privateKey));
        const response = await fetch(
            `/api/get?key=${key}&username=${auth.username}&time=${time}&sig=${toHex(sig)}&nonce=${nonce}`,
        );
        if (response.status === 401) {
            localStorage.clear();
            location.reload();
            return;
        }
        if (response.ok) {
            const data = await response.json();
            return data.data;
        } else {
            throw new Error('Failed to get value from storage');
        }
    },
    new: async (key: string, value: unknown, auth?: Auth) => {
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
        if (response.status === 401) {
            localStorage.clear();
            location.reload();
            return;
        }
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
        const response = await fetch('/api/set', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
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
            });
        }
        const response = await fetch('/api/append', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload,
        });
        if (!response.ok) throw new Error('Failed to append value in storage');
    },
    getRooms: async (_username: string, _auth?: Auth) => {},
    setRooms: async (_username: string, _newRooms: string, _auth?: Auth) => {},
    changeUsername: async (_oldUsername: string, _newUsername: string, _auth?: Auth) => {},

    sendInvite: async (_username: string, _recipient: string, _encryptedPayload: string, _auth?: Auth) => {},
    getInvites: async (_username: string, _auth?: Auth) => {},
    respondInvite: async (
        _username: string,
        _inviter: string,
        _response: 'accept' | 'decline',
        _roomId: string | undefined,
        _auth?: Auth,
    ) => {},
    getNotifications: async (_username: string, _auth?: Auth) => {
        return [];
    },
    clearNotifications: async (_username: string, _auth?: Auth) => {},
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

// Change username API
storage.changeUsername = async (oldUsername: string, newUsername: string, auth?: Auth) => {
    if (!auth) throw new Error('Auth required');
    const time = Math.floor(Date.now() / 1000);
    const nonce = genNonce();
    // signMessage will produce payload: `${oldUsername}|${newUsername}|${time}|${nonce}`
    const sig = await signMessage(newUsername, oldUsername, time, auth.privateKey, nonce);

    const body = { oldUsername, newUsername, sig, time, nonce };
    const res = await fetch('/api/user/name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || 'Failed to change username');
    return data;
};

// Invite API: send encrypted invite payload to recipient
storage.sendInvite = async (username: string, recipient: string, encryptedPayload: string, auth?: Auth) => {
    if (!auth) throw new Error('Auth required');
    const time = Math.floor(Date.now() / 1000);
    const nonce = genNonce();
    const payload = `${username}|${recipient}|${encryptedPayload}|${time}|${nonce}`;
    const sig = await signRaw(payload, auth.privateKey);

    const body = { username, recipient, payload: encryptedPayload, time, sig, nonce } as any;
    const res = await fetch('/api/dm/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || 'Failed to send invite');
    return data;
};

// Get invites for a user
storage.getInvites = async (username: string, auth?: Auth) => {
    if (!auth) throw new Error('Auth required');
    const time = Math.floor(Date.now() / 1000);
    const nonce = genNonce();
    const payload = `${time}|${nonce}`;
    const sig = await signRaw(payload, auth.privateKey);

    const url = `/api/dm/invites/${encodeURIComponent(username)}?sig=${sig}&timestamp=${time}&nonce=${nonce}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to get invites');
    const d = await res.json();
    return d.data;
};

// Fetch notifications for DM (key: dm_notify_<username>)
storage.getNotifications = async (username: string, auth?: Auth) => {
    if (!auth) throw new Error('Auth required');
    const key = `dm_notify_${username}`;
    const time = Math.floor(Date.now() / 1000);
    const nonce = genNonce();
    const msg = `${key}|${time}|${nonce}`;
    const sig = await ed.signAsync(new TextEncoder().encode(msg), fromHex(auth.privateKey));
    const res = await fetch(
        `/api/get?key=${key}&username=${auth.username}&time=${time}&sig=${toHex(sig)}&nonce=${nonce}`,
    );
    if (!res.ok) return [];
    const d = await res.json();
    try {
        return JSON.parse(d.data || '[]');
    } catch {
        return [];
    }
};

// Clear notifications for user (overwrite)
storage.clearNotifications = async (username: string, auth?: Auth) => {
    if (!auth) throw new Error('Auth required');
    const key = `dm_notify_${username}`;
    await storage.set(key, JSON.stringify([]), auth);
};

// Respond to an invite (accept/decline). When accepting, include the roomId you decrypted from payload.
storage.respondInvite = async (
    username: string,
    inviter: string,
    response: 'accept' | 'decline',
    roomId: string | undefined,
    auth?: Auth,
) => {
    if (!auth) throw new Error('Auth required');
    const time = Math.floor(Date.now() / 1000);
    const nonce = genNonce();
    const payload = `${username}|${inviter}|${response}|${roomId || ''}|${time}|${nonce}`;
    const sig = await signRaw(payload, auth.privateKey);

    const body = { username, inviter, response, roomId, time, sig, nonce } as any;
    const res = await fetch('/api/dm/invite/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || 'Failed to respond invite');
    return data;
};
