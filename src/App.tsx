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
import { decryptPrivateKey } from './lib/aes';

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

    const handleLoginSuccess = (userInfo: { username: string; publicKey: string }) => {
        setUser(userInfo);
    };

    useEffect(() => {
        if (!user) return;

        const unlock = async () => {
            const encryptedPrivate = localStorage.getItem('chat-encrypted-private');
            if (!encryptedPrivate) return;

            const unlockedUser = localStorage.getItem('chat-key-unlocked');
            const savedPwd = localStorage.getItem('chat-unlock-pwd');

            if (unlockedUser === user.username && savedPwd) {
                const decrypted = await decryptPrivateKey(encryptedPrivate, savedPwd);
                if (decrypted) {
                    setPrivateKey(decrypted);
                    return;
                }
                localStorage.removeItem('chat-key-unlocked');
                localStorage.removeItem('chat-unlock-pwd');
            }

            const pwd = prompt('请输入密码解锁私钥：') || '';
            const decrypted = await decryptPrivateKey(encryptedPrivate, pwd);
            if (decrypted) {
                setPrivateKey(decrypted);
                localStorage.setItem('chat-key-unlocked', user.username);
                localStorage.setItem('chat-unlock-pwd', pwd);
                toast.success('私钥已解锁');
            } else {
                toast.error('密码错误');
            }
        };

        unlock();
    }, [user]);

    useEffect(() => {
        if (!user) return;
        fetch('/api/user/public-keys')
            .then(res => res.json())
            .then(data => {
                if (data.status === 'success') setPublicKeyMap(data.data);
            });
    }, [user]);

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

    const storageKey = `easychatv2-channel-${roomName}`;
    const localKey = `messages-${roomName}`;

    useEffect(() => {
        messagesRef.current = messages;
        localStorage.setItem(localKey, JSON.stringify(messages));
    }, [messages, localKey]);

    useEffect(() => {
        localStorage.setItem('chat-room-list', JSON.stringify(roomList));
    }, [roomList]);

    const switchRoom = async (newRoom: string) => {
        if (newRoom === roomName) return;
        if (!isSyncing.current) {
            isSyncing.current = true;
            try {
                await storage.set(storageKey, JSON.stringify(messagesRef.current));
            } catch {}
            isSyncing.current = false;
        }
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
                } catch {
                    await storage.new(storageKey, '[]');
                }
                const all = [...local, ...cloud];
                const map = new Map<string, ChatMessage>();
                all.forEach(m => map.set(`${m.time}|${m.username}|${m.msg}`, m));
                setMessages(Array.from(map.values()).sort((a, b) => a.time - b.time));
            } catch {}
        });

        channel.on('join', ({ alias }) => {
            if (alias === user.username) return;
            channel.send(
                JSON.stringify({
                    type: 'message',
                    data: messagesRef.current,
                    to: alias,
                }),
            );
        });

        channel.on('message', async msg => {
            try {
                const data = JSON.parse(msg.message);
                if (data.type === 'message') {
                    setMessages(data.data);
                    return;
                }
                const { username: sendUser, msg: content, time, sig } = data;
                if (!sig) return;
                const pub = publicKeyMap[sendUser];
                if (!pub) return;
                const now = Math.floor(Date.now() / 1000);
                if (Math.abs(now - time) > 30) return;
                const ok = await verifyMessage(content, sendUser, time, sig, pub);
                if (!ok) return;
                setMessages(prev => [...prev, data]);
            } catch {}
        });

        return () => {
            channel.close();
        };
    }, [user, roomName, localKey, storageKey, publicKeyMap]);

    // 页面关闭同步消息
    useEffect(() => {
        const sync = () => {
            if (isSyncing.current) return;
            isSyncing.current = true;
            try {
                // await storage.set(storageKey, JSON.stringify(messagesRef.current));
                const payload = JSON.stringify({ key: storageKey, value: JSON.stringify(messagesRef.current) });
                const blob = new Blob([payload], { type: 'application/json' });
                navigator.sendBeacon('/api/set', blob);
            } catch {}
            isSyncing.current = false;
        };
        window.addEventListener('beforeunload', sync);
        return () => window.removeEventListener('beforeunload', sync);
    }, [storageKey]);

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

    const handleSend = async () => {
        if (!user || !input || !socketRef.current || !privateKey) return;
        const time = Math.floor(Date.now() / 1000);
        const msg = input.trim();
        const sig = await signMessage(msg, user.username, time, privateKey);
        const data = { username: user.username, msg, time, sig };
        socketRef.current.send(JSON.stringify(data));
        setMessages(p => [...p, data]);
        setInput('');
    };

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
                <ScrollArea className="flex-1 p-4">
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
