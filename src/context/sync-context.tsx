import { useEffect, useRef } from 'react';
import { useUser } from './user-context';
import { useRoom } from './room-context';
import { useMessage } from './message-context';
import { signMessage } from '../lib/ed25519';
import { genNonce } from '../lib/utils';

export function SyncProvider() {
    const { user, privateKey } = useUser();
    const { currentRoom } = useRoom();
    const { messages } = useMessage();
    const messagesRef = useRef(messages);
    const signedAppendRef = useRef<string | null>(null);

    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    const storageKey = `easychatv2-channel-${currentRoom.id}`;
    const lastSyncKey = `easychatv2-sync-${currentRoom.id}`;
    const getLastSync = () => Number(localStorage.getItem(lastSyncKey) || 0);

    useEffect(() => {
        const prepare = async () => {
            try {
                const last = getLastSync();
                const newMsgs = messagesRef.current.filter(m => m.time > last);
                if (newMsgs.length === 0 || !user || !privateKey) {
                    signedAppendRef.current = null;
                    return;
                }
                const time = Math.floor(Date.now() / 1000);
                const msg = `${storageKey}|${JSON.stringify(newMsgs)}`;
                const nonce = genNonce();
                const sig = await signMessage(msg, user.username, time, privateKey, nonce);
                const payload = JSON.stringify({
                    key: storageKey,
                    value: JSON.stringify(newMsgs),
                    username: user.username,
                    time,
                    sig,
                    nonce,
                });
                const blob = new Blob([payload], { type: 'application/json' });
                if (blob.size < 60000) {
                    signedAppendRef.current = payload;
                    localStorage.removeItem(`pending-append-${storageKey}`);
                } else {
                    signedAppendRef.current = null;
                    localStorage.setItem(`pending-append-${storageKey}`, payload);
                }
            } catch {}
        };
        prepare();
    }, [storageKey, messages, user, privateKey]);

    useEffect(() => {
        const handler = () => {
            if (document.visibilityState === 'visible') return;
            try {
                const last = getLastSync();
                const newMsgs = messagesRef.current.filter(m => m.time > last);
                if (newMsgs.length === 0) return;

                const pendingKey = `pending-append-${storageKey}`;
                const data = signedAppendRef.current || localStorage.getItem(pendingKey);
                if (!data) return;

                const blob = new Blob([data], { type: 'application/json' });
                if (blob.size < 6000) {
                    navigator.sendBeacon('/api/append', blob);
                } else {
                    localStorage.setItem(pendingKey, data);
                }
            } catch {}
        };

        window.addEventListener('visibilitychange', handler);
        return () => window.removeEventListener('visibilitychange', handler);
    }, [storageKey]);

    useEffect(() => {
        const flush = async () => {
            try {
                const pendingKey = `pending-append-${storageKey}`;
                const pending = localStorage.getItem(pendingKey);
                if (!pending) return;
                const res = await fetch('/api/append', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: pending,
                });
                if (res.ok) localStorage.removeItem(pendingKey);
            } catch {}
        };
        flush();
    }, [storageKey, user, privateKey]);

    return null;
}
