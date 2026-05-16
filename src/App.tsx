import { useEffect, useRef, useState } from 'react';
import { connect, type IttySocket } from 'itty-sockets';
import { ScrollArea } from './components/ui/scroll-area';
import { Input } from './components/ui/input';
import { Button } from './components/ui/button';
import { Separator } from './components/ui/separator';
import { toast } from 'sonner';
import { MessageBubble } from './components/MessageBubble';
import { storage } from './lib/storage';

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

    const messagesRef = useRef<ChatMessage[]>([]);
    const hasPrompted = useRef(false);
    const isSyncing = useRef(false);

    const roomName = 'default';
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
        if (!messages.length) return;
        messagesRef.current = messages;
        if (JSON.parse(localStorage.getItem(localKey) || '[]').length >= messages.length) return;
        localStorage.setItem(localKey, JSON.stringify(messages));
    }, [messages]);

    useEffect(() => {
        if (!username) return;

        const channel = connect(`easy-chat-v2-${roomName}`, { as: username });

        channel.on('open', async () => {
            try {
                const localData = localStorage.getItem(localKey);
                const localMessages: ChatMessage[] = localData
                ? JSON.parse(localData)
                : [];

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

        channel.on('message', (msg) => {
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
    }, [username]);

    useEffect(() => {
        const syncBeforeUnload = async () => {
            if (isSyncing.current) return;
            isSyncing.current = true;

            try {
                const data = JSON.stringify(messagesRef.current);
                await storage.set(storageKey, data);
                console.log('✅ 关闭时同步云端成功');
            } catch (err) {
                console.error('❌ 关闭同步失败', err);
            }
        };

        window.addEventListener('beforeunload', syncBeforeUnload);
        return () => {
            window.removeEventListener('beforeunload', syncBeforeUnload);
        };
    }, []);

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
            <div className="w-64 bg-slate-100 p-4 flex flex-col">
                <h3 className="text-lg font-semibold mb-4">选择聊天室</h3>
                <Separator className="my-2" />
                <div className="mt-4 text-sm">
                    当前用户：<span className="font-medium">{username}</span>
                </div>
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
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="请输入文本"
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        className="flex-1"
                    />
                    <Button type='button' onClick={handleSend} disabled={!input}>
                        发送
                    </Button>
                </div>
            </div>
        </div>
    );
}

export default App;
