import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { connect, type IttySocket } from 'itty-sockets';
import { storage } from '../lib/storage';
import { signMessage, verifyMessage } from '../lib/ed25519';
import { genMessageId, genNonce } from '../lib/utils';
import type { ChatMessage } from '@/types/message';
import { useUser } from './user-context';
import { useRoom } from './room-context';

interface MessageContextType {
    messages: ChatMessage[];
    input: string;
    setInput: (v: string) => void;
    handleSend: () => Promise<void>;
    quoteMsgId: string | null;
    setQuoteMsgId: (id: string | null) => void;
    recallMessage: (messageId: string) => Promise<void>;
    publicKeyMap: Record<string, string>;
    syncToCloud: () => Promise<void>;
}

const MessageContext = createContext<MessageContextType | undefined>(undefined);

export function MessageProvider({ children }: { children: ReactNode }) {
    const { user, privateKey } = useUser();
    const { currentRoom } = useRoom();

    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInputState] = useState('');
    const [quoteMsgId, setQuoteMsgId] = useState<string | null>(null);
    const [publicKeyMap, setPublicKeyMap] = useState<Record<string, string>>({});

    const socketRef = useRef<IttySocket | null>(null);
    const messagesRef = useRef<ChatMessage[]>([]);
    const isSyncing = useRef(false);
    const localNonceSet = useRef<Set<string>>(new Set());
    const NONCE_EXPIRE_SECONDS = 60;

    const storageKey = `easychatv2-channel-${currentRoom.id}`;
    const localKey = `easychatv2-local-${currentRoom.id}`;
    const lastSyncKey = `easychatv2-sync-${currentRoom.id}`;

    const getLastSync = () => Number(localStorage.getItem(lastSyncKey) || 0);
    const setLastSync = (t: number) => localStorage.setItem(lastSyncKey, String(t));

    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    const isNonceUsedLocally = (nonce: string) => {
        if (!nonce) return false;
        const used = localNonceSet.current.has(nonce);
        if (!used) localNonceSet.current.add(nonce);
        return used;
    };

    useEffect(() => {
        const timer = setInterval(() => localNonceSet.current.clear(), NONCE_EXPIRE_SECONDS * 1000);
        return () => clearInterval(timer);
    }, []);

    const syncToCloud = async () => {
        if (isSyncing.current || !user || !privateKey) return;
        isSyncing.current = true;
        try {
            const last = getLastSync();
            const newMsgs = messagesRef.current.filter(m => m.time > last);
            if (newMsgs.length === 0) return;
            await storage.append(storageKey, JSON.stringify(newMsgs), {
                username: user.username,
                privateKey,
            });
            const maxTime = Math.max(...newMsgs.map(m => m.time));
            setLastSync(maxTime);
        } catch {}
        isSyncing.current = false;
    };

    const handleSend = async () => {
        if (!user || !input.trim() || !socketRef.current || !privateKey) return;
        const time = Math.floor(Date.now() / 1000);
        const msg = input.trim();
        const nonce = genNonce();
        const id = genMessageId();
        const sig = await signMessage(msg, user.username, time, privateKey, nonce);
        const data = {
            id,
            username: user.username,
            msg,
            time,
            sig,
            nonce,
            quoteId: quoteMsgId || undefined,
            publicKey: user.publicKey,
        };

        isNonceUsedLocally(nonce);
        socketRef.current.send(JSON.stringify(data));
        setMessages(prev => [...prev, data]);
        setInputState('');

        const last = getLastSync();
        const newMsgs = messagesRef.current.filter(m => m.time > last);
        if (newMsgs.length >= 20) await syncToCloud();
        if (quoteMsgId) setQuoteMsgId(null);
    };

    const recallMessage = async (messageId: string) => {
        setMessages(prev => prev.map(m => (m.id === messageId ? { ...m, recalled: true } : m)));
        try {
            socketRef.current?.send(JSON.stringify({ type: 'recall', id: messageId }));
        } catch {}
    };

    useEffect(() => {
        if (!user) return;
        if (socketRef.current) socketRef.current.close();

        const channel = connect(`easy-chat-v2-${currentRoom.id}`, { as: user.username, announce: true });
        socketRef.current = channel;

        channel.on('open', async () => {
            try {
                const local = JSON.parse(localStorage.getItem(localKey) || '[]');
                let cloud: ChatMessage[] = [];
                try {
                    const data = await storage.get(storageKey);
                    cloud = JSON.parse(data || '[]');
                } catch {
                    await storage.new(storageKey, '[]', { username: user.username, privateKey });
                }
                const all = [...local, ...cloud];
                const map = new Map<string, ChatMessage>();
                all.forEach(m => map.set(`${m.time}|${m.username}|${m.msg}`, m));
                setMessages(Array.from(map.values()).sort((a, b) => a.time - b.time));
            } catch {}
        });

        channel.on('join', async ({ alias }) => {
            if (alias === user.username) return;
            const nonce = genNonce();
            const sig = await signMessage(
                JSON.stringify(messagesRef.current),
                user.username,
                Math.floor(Date.now() / 1000),
                privateKey,
                nonce,
            );
            channel.send(
                JSON.stringify({
                    type: 'message',
                    time: Math.floor(Date.now() / 1000),
                    data: messagesRef.current,
                    to: alias,
                    sig,
                    nonce,
                }),
            );
        });

        channel.on('message', async msg => {
            try {
                const data = JSON.parse(msg.message);
                if (data.nonce && isNonceUsedLocally(data.nonce)) return;

                if (data.type === 'message' && data.to === user.username) {
                    if (!data.sig) return;
                    const pub = publicKeyMap[msg.alias];
                    if (!pub) return;
                    const ok = await verifyMessage(
                        JSON.stringify(data.data),
                        msg.alias,
                        data.time,
                        data.sig,
                        pub,
                        data.nonce || '',
                    );
                    if (!ok) return;
                    setMessages(data.data);
                    return;
                }

                if (data.type === 'recall') {
                    setMessages(prev => prev.map(m => (m.id === data.id ? { ...m, recalled: true } : m)));
                    return;
                }

                const { username: sendUser, msg: content, time, sig, nonce, publicKey } = data;
                if (!sig) return;
                // If sender included publicKey in message, trust and cache it for this username
                if (publicKey) {
                    setPublicKeyMap(prev => ({ ...prev, [sendUser]: publicKey }));
                }

                let pub = publicKeyMap[sendUser] || publicKey;
                if (!pub) {
                    const res = await fetch('/api/user/public-keys');
                    const d = await res.json();
                    if (d.status === 'success') {
                        setPublicKeyMap(d.data);
                        pub = d.data[sendUser];
                    }
                }
                if (!pub) return;
                const now = Math.floor(Date.now() / 1000);
                if (Math.abs(now - time) > 10) return;
                const ok = await verifyMessage(content, sendUser, time, sig, pub, nonce || '');
                if (!ok) return;
                setMessages(prev => {
                    if (prev.some(m => m.time === time && m.username === sendUser && m.msg === content)) return prev;
                    return [...prev, data];
                });
            } catch {}
        });

        return () => {
            channel.close();
        };
    }, [user, currentRoom.id, publicKeyMap]);

    useEffect(() => {
        if (!user) return;
        fetch('/api/user/public-keys')
            .then(res => res.json())
            .then(d => {
                if (d.status === 'success') setPublicKeyMap(d.data);
            });
    }, [user]);

    return (
        <MessageContext.Provider
            value={{
                messages,
                input,
                setInput: setInputState,
                handleSend,
                quoteMsgId,
                setQuoteMsgId,
                recallMessage,
                publicKeyMap,
                syncToCloud,
            }}
        >
            {children}
        </MessageContext.Provider>
    );
}

export const useMessage = () => {
    const ctx = useContext(MessageContext);
    if (!ctx) throw new Error('useMessage must be used within MessageProvider');
    return ctx;
};
