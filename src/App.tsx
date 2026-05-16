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

interface ChatMessage {
    username: string;
    msg: string;
    time: number;
}

const formatTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
};

function App() {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [channel, setChannel] = useState<IttySocket | null>(null);
    const [username, setUsername] = useState<string | null>(null);
    const [roomName, setRoomName] = useState('default');

    // 👇 从 localStorage 加载 roomList（唯一改动点）
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
    const hasPrompted = useRef(false);
    const isSyncing = useRef(false);

    const storageKey = `easychatv2-channel-${roomName}`;
    const localKey = `messages-${roomName}`;

    useEffect(() => {
        if (hasPrompted.current) return;
        hasPrompted.current = true;

        const savedName = localStorage.getItem('chat-username');
        if (savedName) {
            setUsername(savedName);
            return;
        }

        const name = prompt('请输入用户名')?.trim();
        if (name) {
            localStorage.setItem('chat-username', name);
            setUsername(name);
        } else {
            const defaultName = `用户${Math.floor(Math.random() * 10000)}`;
            localStorage.setItem('chat-username', defaultName);
            setUsername(defaultName);
        }
    }, []);

    useEffect(() => {
        messagesRef.current = messages;
        localStorage.setItem(localKey, JSON.stringify(messages));
    }, [messages, localKey]);

    // 👇 持久化 roomList 到 localStorage（唯一改动点）
    useEffect(() => {
        localStorage.setItem('chat-room-list', JSON.stringify(roomList));
    }, [roomList]);

    const switchRoom = async (newRoom: string) => {
        if (newRoom === roomName) return;

        if (!isSyncing.current) {
            isSyncing.current = true;
            try {
                const data = JSON.stringify(messagesRef.current);
                await storage.set(storageKey, data);
                console.log('✅ 离开房间已同步云端:', roomName);
            } catch (err) {
                console.error('❌ 离开房间同步失败', err);
            }
            isSyncing.current = false;
        }

        setMessages([]);
        messagesRef.current = [];
        setRoomName(newRoom);
    };

    useEffect(() => {
        if (!username) return;

        const channel = connect(`easy-chat-v2-${roomName}`, { as: username });

        channel.on('open', async () => {
            try {
                const localData = localStorage.getItem(localKey);
                const localMessages: ChatMessage[] = localData ? JSON.parse(localData) : [];

                let cloudMessages: ChatMessage[] = [];
                try {
                    const cloudData = await storage.get(storageKey);
                    cloudMessages = cloudData ? JSON.parse(cloudData) : [];
                } catch {
                    await storage.new(storageKey, '[]');
                }

                const all = [...localMessages, ...cloudMessages];
                const uniqueMap = new Map<string, ChatMessage>();
                for (const m of all) {
                    const key = `${m.time}||${m.username}||${m.msg}`;
                    uniqueMap.set(key, m);
                }
                const merged = Array.from(uniqueMap.values()).sort((a, b) => a.time - b.time);
                setMessages(merged);
            } catch (err) {
                console.error('加载消息失败', err);
            }
        });

        channel.on('message', msg => {
            try {
                const data = JSON.parse(msg.message);
                setMessages(prev => [...prev, data]);
            } catch (err) {
                console.error('解析失败', err);
            }
        });

        setChannel(channel);

        return () => {
            channel.close();
        };
    }, [username, roomName, storageKey, localKey]);

    useEffect(() => {
        const syncBeforeUnload = async () => {
            if (isSyncing.current) return;
            isSyncing.current = true;
            try {
                const data = JSON.stringify(messagesRef.current);
                await storage.set(storageKey, data);
                console.log('✅ 关闭页面同步云端成功');
            } catch (err) {
                console.error('❌ 关闭页面同步失败', err);
            }
            isSyncing.current = false;
        };

        window.addEventListener('beforeunload', syncBeforeUnload);
        return () => {
            window.removeEventListener('beforeunload', syncBeforeUnload);
        };
    }, [storageKey]);

    // 创建房间
    const handleCreateRoom = () => {
        if (!newRoomName.trim()) {
            toast.info('房间名不能为空');
            return;
        }
        if (roomList.includes(newRoomName)) {
            toast.info('房间已存在');
            return;
        }
        setRoomList(prev => [...prev, newRoomName]);
        switchRoom(newRoomName);
        setNewRoomName('');
        toast.success('创建并加入房间：' + newRoomName);
    };

    const handleJoinRoom = () => {
        if (!joinRoomName.trim()) {
            toast.info('请输入房间名');
            return;
        }
        if (!roomList.includes(joinRoomName)) {
            setRoomList(prev => [...prev, joinRoomName]);
        }
        switchRoom(joinRoomName);
        setJoinRoomName('');
        toast.success('已加入房间：' + joinRoomName);
    };

    const handleSend = () => {
        if (!input.trim()) {
            toast.info('不能发送空消息');
            return;
        }
        if (!channel) {
            toast.error('未连接');
            return;
        }

        const payload = JSON.stringify({
            username,
            msg: input.trim(),
            time: Date.now() / 1000,
        });

        channel.send(payload);
        setMessages(prev => [...prev, JSON.parse(payload)]);
        setInput('');
        toast.success('发送成功');
    };

    return (
        <div className="flex h-screen overflow-hidden">
            <div className="w-64 bg-slate-100 p-4 flex flex-col gap-3">
                <h3 className="text-lg font-semibold">聊天室</h3>
                <Separator />

                <div className="text-sm text-green-700 font-medium">当前：{roomName}</div>

                <DialogScrollArea className="h-87.5 pr-2">
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
                            <DialogTitle>创建新房间</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-3">
                            <DialogInput
                                placeholder="输入房间名"
                                value={newRoomName}
                                onChange={e => setNewRoomName(e.target.value)}
                            />
                        </div>
                        <DialogFooter>
                            <DialogClose asChild>
                                <Button size="sm" onClick={handleCreateRoom}>
                                    创建并加入
                                </Button>
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
                        <div className="space-y-3">
                            <DialogInput
                                placeholder="输入房间名"
                                value={joinRoomName}
                                onChange={e => setJoinRoomName(e.target.value)}
                            />
                        </div>
                        <DialogFooter>
                            <DialogClose asChild>
                                <Button size="sm" onClick={handleJoinRoom}>
                                    加入
                                </Button>
                            </DialogClose>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <div className="mt-auto text-xs text-slate-500">当前用户：{username}</div>
            </div>

            <div className="flex-1 flex flex-col">
                <ScrollArea className="flex-1 p-4">
                    <div className="space-y-4">
                        {messages.map((item, idx) => (
                            <MessageBubble
                                key={idx}
                                message={item}
                                currentUsername={username || ''}
                                formatTime={formatTime}
                            />
                        ))}
                    </div>
                </ScrollArea>

                <div className="p-3 border-t flex gap-2 items-center bg-white">
                    <Input
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        placeholder="请输入文本"
                        onKeyDown={e => e.key === 'Enter' && handleSend()}
                        className="flex-1"
                    />
                    <Button type="button" onClick={handleSend} disabled={!input}>
                        发送
                    </Button>
                </div>
            </div>
        </div>
    );
}

export default App;
