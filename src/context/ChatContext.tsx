import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { connect, type IttySocket } from 'itty-sockets';
import { storage } from '../lib/storage';
import { signMessage, verifyMessage } from '../lib/ed25519';
import { genNonce } from '../lib/utils';
import { genRoomId } from '../lib/utils';

export interface ChatMessage {
    username: string;
    msg: string;
    time: number;
    sig?: string;
    nonce?: string;
    quote?: ChatMessage;
}

interface User {
    username: string;
    publicKey: string;
}

interface Room {
    id: string; // 唯一ID（业务标识）
    name: string; // 显示名称
}

interface ChatContextType {
    user: User | null;
    privateKey: string;
    messages: ChatMessage[];
    currentRoom: Room;
    roomList: Room[];
    input: string;
    publicKeyMap: Record<string, string>;
    setUser: (user: User | null, privateKey?: string) => void;
    createRoom: (roomName: string) => Promise<void>;
    joinRoomById: (roomId: string, roomName: string) => Promise<void>;
    switchToRoom: (room: Room) => Promise<void>;
    setInput: (v: string) => void;
    handleSend: () => Promise<void>;
    quoteMessage: ChatMessage | null;
    setQuoteMessage: (msg: ChatMessage | null) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: ReactNode }) {
    const [user, setUserState] = useState<User | null>(null);
    const [privateKey, setPrivateKeyState] = useState('');
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [currentRoom, setCurrentRoom] = useState<Room>({ id: 'room_default', name: '默认房间' });
    const [roomList, setRoomListState] = useState<Room[]>(() => {
        const saved = localStorage.getItem('chat-rooms');
        return saved ? JSON.parse(saved) : [{ id: 'room_default', name: '默认房间' }];
    });
    const [input, setInputState] = useState('');
    const [publicKeyMap, setPublicKeyMap] = useState<Record<string, string>>({});

    const socketRef = useRef<IttySocket | null>(null);
    const messagesRef = useRef<ChatMessage[]>([]);
    const isSyncing = useRef(false);
    const signedAppendRef = useRef<string | null>(null);
    const localNonceSet = useRef<Set<string>>(new Set());
    const NONCE_EXPIRE_SECONDS = 60;

    const [quoteMessage, setQuoteMessage] = useState<ChatMessage | null>(null);

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

    const storageKey = `easychatv2-channel-${currentRoom.id}`;
    const localKey = `easychatv2-local-${currentRoom.id}`;
    const lastSyncKey = `easychatv2-sync-${currentRoom.id}`;

    const getLastSync = () => Number(localStorage.getItem(lastSyncKey) || 0);
    const setLastSync = (t: number) => localStorage.setItem(lastSyncKey, String(t));

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

    const switchToRoom = async (room: Room) => {
        await syncToCloud();
        socketRef.current?.close();
        socketRef.current = null;
        setMessages([]);
        messagesRef.current = [];
        setCurrentRoom(room);
    };

    const createRoom = async (roomName: string) => {
        const id = genRoomId();
        const newRoom: Room = { id, name: roomName };
        setRoomListState(prev => {
            const exists = prev.some(r => r.id === id);
            return exists ? prev : [...prev, newRoom];
        });
        await switchToRoom(newRoom);
    };

    const joinRoomById = async (roomId: string, roomName: string) => {
        const target = roomList.find(r => r.id === roomId);
        if (target) {
            await switchToRoom(target);
            return;
        }
        const newRoom: Room = { id: roomId, name: roomName };
        setRoomListState(prev => [...prev, newRoom]);
        await switchToRoom(newRoom);
    };

    const handleSend = async () => {
        if (!user || !input.trim() || !socketRef.current || !privateKey) return;
        const time = Math.floor(Date.now() / 1000);
        const msg = input.trim();
        const nonce = genNonce();
        const sig = await signMessage(msg, user.username, time, privateKey, nonce);
        const data = { username: user.username, msg, time, sig, nonce, quote: quoteMessage || undefined };

        isNonceUsedLocally(nonce);
        socketRef.current.send(JSON.stringify(data));
        setMessages(prev => [...prev, data]);
        setInputState('');

        // 如果缓存消息 >= 20 条，就立即同步到云端
        const last = getLastSync();
        const newMsgs = messagesRef.current.filter(m => m.time > last);
        if (newMsgs.length >= 20) {
            await syncToCloud();
        }

        if (quoteMessage) setQuoteMessage(null);
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
                    const nonce = data.nonce || '';
                    const ok = await verifyMessage(
                        JSON.stringify(data.data),
                        msg.alias,
                        data.time,
                        data.sig,
                        pub,
                        nonce,
                    );
                    if (!ok) return;
                    setMessages(data.data);
                    return;
                }

                const { username: sendUser, msg: content, time, sig, nonce } = data;
                if (!sig) return;

                let pub = publicKeyMap[sendUser];
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
        const prepare = async () => {
            try {
                const last = getLastSync();
                const newMsgs = messagesRef.current.filter(m => m.time > last);
                if (newMsgs.length === 0) {
                    signedAppendRef.current = null;
                    return;
                }
                if (!user || !privateKey) {
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
                const MAX_BEACON_BYTES = 6000;
                if (blob.size < MAX_BEACON_BYTES) {
                    signedAppendRef.current = payload;
                    localStorage.removeItem(`pending-append-${storageKey}`);
                } else {
                    signedAppendRef.current = null;
                    localStorage.setItem(`pending-append-${storageKey}`, payload);
                }
            } catch {}
        };

        prepare();

        const beforeUnloadHandler = () => {
            try {
                const pendingKey = `pending-append-${storageKey}`;
                const data = signedAppendRef.current || localStorage.getItem(pendingKey);
                if (!data) return;
                const blob = new Blob([data], { type: 'application/json' });
                const MAX_BEACON_BYTES = 6000;
                if (blob.size < MAX_BEACON_BYTES) {
                    navigator.sendBeacon('/api/append', blob);
                } else {
                    localStorage.setItem(pendingKey, data);
                }
            } catch {}
        };

        window.addEventListener('beforeunload', beforeUnloadHandler);
        return () => window.removeEventListener('beforeunload', beforeUnloadHandler);
    }, [storageKey, messages, user, privateKey]);

    useEffect(() => {
        const tryFlush = async () => {
            try {
                const pendingKey = `pending-append-${storageKey}`;
                const pending = localStorage.getItem(pendingKey);
                if (!pending) return;
                const res = await fetch('/api/append', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: pending,
                });
                if (res.ok) {
                    localStorage.removeItem(pendingKey);
                }
            } catch {}
        };
        tryFlush();
    }, [storageKey, user, privateKey]);

    useEffect(() => {
        localStorage.setItem('chat-rooms', JSON.stringify(roomList));
    }, [roomList]);

    useEffect(() => {
        if (!user) return;
        fetch('/api/user/public-keys')
            .then(res => res.json())
            .then(d => {
                if (d.status === 'success') setPublicKeyMap(d.data);
            });
    }, [user]);

    const setUser = (user: User | null, pk = '') => {
        setUserState(user);
        setPrivateKeyState(pk);
    };

    return (
        <ChatContext.Provider
            value={{
                user,
                privateKey,
                messages,
                currentRoom,
                roomList,
                input,
                publicKeyMap,
                setUser,
                createRoom,
                joinRoomById,
                switchToRoom,
                setInput: setInputState,
                handleSend,
                quoteMessage,
                setQuoteMessage,
            }}
        >
            {children}
        </ChatContext.Provider>
    );
}

export const useChat = () => {
    const ctx = useContext(ChatContext);
    if (!ctx) throw new Error('useChat must be used within ChatProvider');
    return ctx;
};
