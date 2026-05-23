import { useEffect, useRef, useState } from 'react';
import { connect, type IttySocket } from 'itty-sockets';
import { ScrollArea } from './components/ui/scroll-area';
import { Input } from './components/ui/input';
import { Button } from './components/ui/button';
import { Separator } from './components/ui/separator';
import { toast } from 'sonner';
import { MessageBubble } from './components/MessageBubble';
import { storage } from './lib/storage';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from './components/ui/dialog';
import { Input as DialogInput } from './components/ui/input';
import { ScrollArea as DialogScrollArea } from './components/ui/scroll-area';
import { AuthModal } from './components/AuthModal';
import { signMessage, verifyMessage } from './lib/ed25519';

interface ChatMessage {
    username: string;
    msg: string;
    time: number;
    sig?: string;
}

function App() {
    const [user, setUser] = useState<{ username: string; publicKey: string } | null>(null);
    const [privateKey, setPrivateKey] = useState('');
    const [publicKeyMap, setPublicKeyMap] = useState<Record<string, string>>({});
    const socketRef = useRef<IttySocket | null>(null);

    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [roomName, setRoomName] = useState('default');

    const [roomList, setRoomList] = useState<string[]>(() => {
        try {
            const saved = localStorage.getItem('chat-room-list');
            return saved ? JSON.parse(saved) : ['default'];
        } catch {
            return ['default'];
        }
    });

    const [newRoomName, setNewRoomName] = useState('');
    const [joinRoomName, setJoinRoomName] = useState('');

    const messagesRef = useRef<ChatMessage[]>([]);
    const isSyncing = useRef(false);
    const signedAppendRef = useRef<string | null>(null);

    const storageKey = `easychatv2-channel-${roomName}`;
    const localKey = `messages-${roomName}`;
    const lastSyncKey = `last-sync-${roomName}`;

    const getLastSync = () => Number(localStorage.getItem(lastSyncKey) || 0);
    const setLastSync = (t: number) => localStorage.setItem(lastSyncKey, String(t));

    const syncToCloud = async () => {
        if (isSyncing.current) return;
        isSyncing.current = true;
        try {
            const last = getLastSync();
            const newMsgs = messagesRef.current.filter(m => m.time > last);
            if (newMsgs.length === 0) return;

            if (user && privateKey) {
                await storage.append(storageKey, JSON.stringify(newMsgs), { username: user.username, privateKey });
            } else {
                await fetch('/api/append', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        key: storageKey,
                        value: JSON.stringify(newMsgs),
                    }),
                });
            }

            // 同步成功，更新最后同步时间
            const maxTime = Math.max(...newMsgs.map(m => m.time));
            setLastSync(maxTime);
        } catch {}
        isSyncing.current = false;
    };

    useEffect(() => {
        messagesRef.current = messages;
        localStorage.setItem(localKey, JSON.stringify(messages));
    }, [messages, localKey]);

    useEffect(() => {
        localStorage.setItem('chat-room-list', JSON.stringify(roomList));
    }, [roomList]);

    const switchRoom = async (newRoom: string) => {
        if (newRoom === roomName) return;
        await syncToCloud();

        if (socketRef.current) {
            socketRef.current.close();
            socketRef.current = null;
        }
        setMessages([]);
        messagesRef.current = [];
        setRoomName(newRoom);
    };

    useEffect(() => {
        if (!user) return;
        if (socketRef.current) socketRef.current.close();

        const channel = connect(`easy-chat-v2-${roomName}`, { as: user.username, announce: true });
        socketRef.current = channel;

        channel.on('open', async () => {
            try {
                const local = JSON.parse(localStorage.getItem(localKey) || '[]');
                let cloud: ChatMessage[] = [];
                try {
                    const data = await storage.get(storageKey);
                    cloud = JSON.parse(data || '[]');
                } catch (err) {
                    if (user && privateKey)
                        await storage.new(storageKey, '[]', { username: user.username, privateKey });
                }

                const all = [...local, ...cloud];
                const map = new Map<string, ChatMessage>();
                all.forEach(m => map.set(`${m.time}|${m.username}|${m.msg}`, m));
                const sorted = Array.from(map.values()).sort((a, b) => a.time - b.time);

                setMessages(sorted);

                if (sorted.length > 0) {
                    const maxTime = Math.max(...sorted.map(m => m.time));
                    setLastSync(maxTime);
                }
            } catch {}
        });

        channel.on('join', async ({ alias }) => {
            if (alias === user.username) return;
            const sig = await signMessage(
                JSON.stringify(messagesRef.current),
                user.username,
                Math.floor(Date.now() / 1000),
                privateKey,
            );
            channel.send(
                JSON.stringify({
                    type: 'message',
                    time: Math.floor(Date.now() / 1000),
                    data: messagesRef.current,
                    to: alias,
                    sig,
                }),
            );
        });

        channel.on('message', async msg => {
            try {
                const data = JSON.parse(msg.message);
                if (data.type === 'message' && data.to === user.username) {
                    if (!data.sig) return;
                    const pub = publicKeyMap[msg.alias];
                    if (!pub) return;
                    const ok = await verifyMessage(JSON.stringify(data.data), msg.alias, data.time, data.sig, pub);
                    if (!ok) return;
                    setMessages(data.data);
                    return;
                }

                const { username: sendUser, msg: content, time, sig } = data;
                if (!sig) return;
                let pub = publicKeyMap[sendUser];
                if (!pub) {
                    // 可能公钥列表被更新了，尝试重新获取一次
                    try {
                        const res = await fetch('/api/user/public-keys');
                        const resData = await res.json();
                        if (resData.status === 'success') {
                            setPublicKeyMap(resData.data);
                            pub = resData.data[sendUser];
                        }
                    } catch {}
                }
                if (!pub) return;
                const now = Math.floor(Date.now() / 1000);
                if (Math.abs(now - time) > 10) return;
                const ok = await verifyMessage(content, sendUser, time, sig, pub);
                if (!ok) return;

                setMessages(prev => {
                    const exist = prev.some(m => m.time === time && m.username === sendUser && m.msg === content);
                    if (exist) return prev;
                    return [...prev, data];
                });
            } catch {}
        });

        return () => {
            channel.close();
        };
    }, [user, roomName, localKey, storageKey, publicKeyMap]);

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
                const sig = await signMessage(msg, user.username, time, privateKey);
                const payload = JSON.stringify({
                    key: storageKey,
                    value: JSON.stringify(newMsgs),
                    username: user.username,
                    time,
                    sig,
                });

                const blob = new Blob([payload], { type: 'application/json' });
                const MAX_BEACON_BYTES = 60000;
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
                const MAX_BEACON_BYTES = 60000;
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

    const handleCreateRoom = () => {
        if (!newRoomName) {
            toast.info('房间名不能为空');
            return;
        }
        if (roomList.includes(newRoomName)) {
            toast.info('房间已存在');
            return;
        }
        setRoomList(p => [...p, newRoomName]);
        switchRoom(newRoomName);
        setNewRoomName('');
    };

    const handleJoinRoom = () => {
        if (!joinRoomName) {
            toast.info('请输入房间名');
            return;
        }
        if (!roomList.includes(joinRoomName)) setRoomList(p => [...p, joinRoomName]);
        switchRoom(joinRoomName);
        setJoinRoomName('');
    };

    // 发送消息 + 每 30 条自动增量同步
    const handleSend = async () => {
        if (!user || !input || !socketRef.current || !privateKey) return;
        const time = Math.floor(Date.now() / 1000);
        const msg = input.trim();
        const sig = await signMessage(msg, user.username, time, privateKey);
        const data = { username: user.username, msg, time, sig };

        socketRef.current.send(JSON.stringify(data));
        setMessages(p => [...p, data]);
        setInput('');

        const total = messagesRef.current.length;
        if (total % 30 === 0) {
            syncToCloud();
        }
    };

    const handleLoginSuccess = (userInfo: { username: string; publicKey: string }, privateKey: string) => {
        setUser(userInfo);
        setPrivateKey(privateKey);
    };

    useEffect(() => {
        if (!user) return;
        fetch('/api/user/public-keys')
            .then(res => res.json())
            .then(data => {
                if (data.status === 'success') setPublicKeyMap(data.data);
            });
    }, [user]);

    if (!user) return <AuthModal onLoginSuccess={handleLoginSuccess} />;

    return (
        <div className="flex h-screen overflow-hidden">
            <div className="w-64 bg-slate-100 p-4 flex flex-col gap-3">
                <h3 className="text-lg font-semibold">聊天室</h3>
                <Separator />
                <div className="text-sm font-medium">当前：{roomName}</div>
                <DialogScrollArea className="h-[65vh] pr-2">
                    <div className="space-y-1">
                        {roomList.map(room => (
                            <Button
                                key={room}
                                variant={room === roomName ? 'default' : 'ghost'}
                                className="w-full justify-start"
                                onClick={() => switchRoom(room)}
                            >
                                #{room}
                            </Button>
                        ))}
                    </div>
                </DialogScrollArea>
                <Separator />
                <Dialog>
                    <DialogTrigger asChild>
                        <Button size="sm">创建房间</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>创建房间</DialogTitle>
                        </DialogHeader>
                        <DialogInput
                            value={newRoomName}
                            onChange={e => setNewRoomName(e.target.value)}
                            placeholder="房间名"
                        />
                        <DialogFooter>
                            <DialogClose asChild>
                                <Button onClick={handleCreateRoom}>创建</Button>
                            </DialogClose>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
                <Dialog>
                    <DialogTrigger asChild>
                        <Button size="sm">加入房间</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>加入房间</DialogTitle>
                        </DialogHeader>
                        <DialogInput
                            value={joinRoomName}
                            onChange={e => setJoinRoomName(e.target.value)}
                            placeholder="房间名"
                        />
                        <DialogFooter>
                            <DialogClose asChild>
                                <Button onClick={handleJoinRoom}>加入</Button>
                            </DialogClose>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
                <div className="text-xs text-muted-foreground mt-auto">用户：{user.username}</div>
            </div>
            <div className="flex-1 flex flex-col">
                <ScrollArea className="flex-1 p-4 h-[calc(100vh-64px)]">
                    <div className="space-y-4">
                        {messages.map((m, i) => (
                            <MessageBubble key={i} message={m} currentUsername={user.username} />
                        ))}
                    </div>
                </ScrollArea>
                <div className="p-3 border-t flex gap-2">
                    <Input
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSend()}
                        placeholder="输入消息..."
                        className="flex-1"
                    />
                    <Button onClick={handleSend}>发送</Button>
                </div>
            </div>
        </div>
    );
}

export default App;
