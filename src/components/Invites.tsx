import React, { useCallback, useMemo } from 'react';
import {
    Dialog,
    DialogTrigger,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogClose,
} from './ui/dialog';
import { Button } from './ui/button';
import { useMessage } from '@/context/message-context';
import { useUser } from '@/context/user-context';
import { useRoom } from '@/context/room-context';
import { storage } from '@/lib/storage';
import { toast } from 'sonner';

export function Invites() {
    const { user, privateKey } = useUser();
    const { joinRoomById } = useRoom();
    const { handleSend, setInput } = useMessage();
    const [open, setOpen] = React.useState(false);
    const [invites, setInvites] = React.useState<{ from: string; payload: string; time: number }[]>([]);
    const auth = useMemo(
        () => (user && privateKey ? { username: user.username, privateKey } : undefined),
        [privateKey, user],
    );

    const load = useCallback(async () => {
        if (!user || !auth) return;
        try {
            const d = await storage.getInvites(user.username, auth);
            setInvites(Array.isArray(d) ? d : []);
        } catch {
            setInvites([]);
        }
    }, [user, auth]);

    React.useEffect(() => {
        if (open) {
            queueMicrotask(load);
        }
    }, [load, open, user]);

    const handleRespond = async (inv: { from: string; payload: string }, resp: 'accept' | 'decline') => {
        if (!user || !auth) return;
        try {
            // payload may be encrypted client-side; here we assume plaintext JSON { roomId, name }
            let roomId: string | undefined = undefined;
            let roomName: string | undefined = undefined;
            try {
                const p = JSON.parse(inv.payload);
                roomId = p.roomId;
                roomName = `私聊: ${inv.from}`;
            } catch {
                /* empty */
            }
            await storage.respondInvite(user.username, inv.from, resp, roomId, auth);
            toast.success(resp === 'accept' ? '已接受' : '已拒绝');
            // if accepted and we have a roomId, switch to it locally
            if (resp === 'accept' && roomId) {
                try {
                    await joinRoomById(roomId, roomName || `私聊: ${inv.from}`);
                    setOpen(false);
                    queueMicrotask(() => {
                        setInput('我们已成功添加为好友，现在可以开始聊天啦~');
                        handleSend();
                    });
                } catch {
                    /* ignore */
                }
            }
            await load();
        } catch (err) {
            toast.error((err as Error).message || '操作失败');
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button size="sm">邀请管理</Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>我的邀请</DialogTitle>
                </DialogHeader>
                <div className="p-2">
                    {invites.length === 0 && <div className="text-sm text-muted-foreground">暂无邀请</div>}
                    {invites.map((inv, idx) => (
                        <div key={idx} className="p-2 border rounded mb-2">
                            <div className="text-sm">来自：{inv.from}</div>
                            <div className="text-xs text-muted-foreground">
                                时间：{new Date(inv.time * 1000).toLocaleString()}
                            </div>
                            <div className="mt-2 flex gap-2">
                                <Button onClick={() => void handleRespond(inv, 'accept')}>接受</Button>
                                <Button variant="ghost" onClick={() => void handleRespond(inv, 'decline')}>
                                    拒绝
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button>关闭</Button>
                    </DialogClose>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
