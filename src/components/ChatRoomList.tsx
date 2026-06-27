import { DeleteIcon, EditIcon } from 'lucide-react';
import { Button } from '../components/ui/button';
import { ScrollArea } from '../components/ui/scroll-area';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuGroup,
    ContextMenuItem,
    ContextMenuTrigger,
} from './ui/context-menu';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Field } from './ui/field';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { useRoom } from '@/context/room-context';
import { useState } from 'react';

export function ChatRoomList() {
    const {
        roomList,
        currentRoom,
        switchToRoom,
        setRoomList,
        editingRoomName,
        setEditingRoomName,
        setEditingRoom,
        editRoomName,
    } = useRoom();
    const [isOpen, setIsOpen] = useState(false);
    return (
        <ScrollArea className="h-[65vh] px-1 border rounded">
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>编辑房间名</DialogTitle>
                    </DialogHeader>
                    <Field>
                        <Label>房间名</Label>
                        <Input value={editingRoomName} onChange={e => setEditingRoomName(e.target.value)} />
                    </Field>
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button variant="outline">取消</Button>
                        </DialogClose>
                        <Button
                            type="submit"
                            onClick={async () => {
                                await editRoomName();
                                setIsOpen(false);
                            }}
                        >
                            保存
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <div className="space-y-1">
                {roomList.map(room => (
                    <ContextMenu>
                        <ContextMenuTrigger>
                            <Button
                                key={room.id}
                                variant={room.id === currentRoom.id ? 'default' : 'ghost'}
                                className="w-full justify-start"
                                onClick={() => switchToRoom(room)}
                            >
                                # {room.name}
                            </Button>
                        </ContextMenuTrigger>
                        <ContextMenuContent side="right">
                            <ContextMenuGroup>
                                <ContextMenuItem
                                    onClick={() => {
                                        setEditingRoomName(room.name);
                                        setEditingRoom(room);
                                        setIsOpen(true);
                                    }}
                                >
                                    <EditIcon />
                                    编辑
                                </ContextMenuItem>
                                <ContextMenuItem
                                    variant="destructive"
                                    onClick={() => {
                                        setRoomList(roomList.filter(r => r.id !== room.id));
                                    }}
                                >
                                    <DeleteIcon />
                                    删除
                                </ContextMenuItem>
                            </ContextMenuGroup>
                        </ContextMenuContent>
                    </ContextMenu>
                ))}
            </div>
        </ScrollArea>
    );
}
