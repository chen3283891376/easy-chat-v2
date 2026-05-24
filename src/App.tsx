import { useState } from 'react';
import { ChatProvider } from './context/ChatContext';
import { ChatRoomList } from './components/ChatRoomList';
import { ChatMessageArea } from './components/ChatMessageArea';
import { ChatInput } from './components/ChatInput';
import { AuthModal } from './components/AuthModal';
import { useChat } from './context/ChatContext';
import { Separator } from './components/ui/separator';
import {
    Dialog,
    DialogTrigger,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogClose,
} from './components/ui/dialog';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { toast } from 'sonner';

function ChatApp() {
    const { user, currentRoom, createRoom, joinRoomById, setUser } = useChat();
    const [newRoomName, setNewRoomName] = useState('');
    const [joinRoomId, setJoinRoomId] = useState('');
    const [joinRoomName, setJoinRoomName] = useState('');

    const handleCreateRoom = () => {
        if (!newRoomName) return toast.info('房间名不能为空');
        createRoom(newRoomName);
        setNewRoomName('');
    };

    const handleJoinRoom = () => {
        if (!joinRoomId) return toast.info('请输入房间ID');
        if (!joinRoomName) return toast.info('请输入房间显示名');
        joinRoomById(joinRoomId, joinRoomName);
    };

    if (!user) return <AuthModal onLoginSuccess={setUser} />;

    return (
        <div className="flex h-screen overflow-hidden">
            <div className="w-64 bg-slate-100 p-4 flex flex-col gap-3">
                <h3 className="text-lg font-semibold">聊天室</h3>
                <Separator />
                <div className="text-sm font-medium">
                    当前：{currentRoom.name}
                    <div className="text-xs text-gray-500 mt-1">ID: {currentRoom.id}</div>
                </div>
                <ChatRoomList />
                <Separator />

                <Dialog>
                    <DialogTrigger asChild>
                        <Button size="sm">创建房间</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>创建房间</DialogTitle>
                        </DialogHeader>
                        <Input
                            value={newRoomName}
                            onChange={e => setNewRoomName(e.target.value)}
                            placeholder="房间显示名"
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
                        <Input
                            value={joinRoomId}
                            onChange={e => setJoinRoomId(e.target.value)}
                            placeholder="房间唯一ID"
                        />
                        <Input
                            value={joinRoomName}
                            onChange={e => setJoinRoomName(e.target.value)}
                            placeholder="房间显示名"
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
                <ChatMessageArea />
                <ChatInput />
            </div>
        </div>
    );
}

export default function App() {
    return (
        <ChatProvider>
            <ChatApp />
        </ChatProvider>
    );
}
