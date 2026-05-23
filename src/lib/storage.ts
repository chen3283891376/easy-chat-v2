import { signMessage } from './ed25519';
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
        const body: any = { key, value };
        if (auth) {
            const time = Math.floor(Date.now() / 1000);
            const nonce = genNonce();
            const msg = `${key}|${value}`;
            const sig = await signMessage(msg, auth.username, time, auth.privateKey, nonce);

            body.username = auth.username;
            body.time = time;
            body.sig = sig;
            body.nonce = nonce;
        }
        const response = await fetch('/api/append', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!response.ok) throw new Error('Failed to append value in storage');
    }
};
