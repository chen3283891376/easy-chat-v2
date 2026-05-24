import { DeleteIcon } from 'lucide-react';
import { Button } from '../components/ui/button';
import { ScrollArea } from '../components/ui/scroll-area';
import { useChat } from '../context/ChatContext';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuGroup,
    ContextMenuItem,
    ContextMenuTrigger,
} from './ui/context-menu';

export function ChatRoomList() {
    const { roomList, currentRoom, switchToRoom, setRoomList } = useChat();
    return (
        <ScrollArea className="h-[65vh] px-1 border rounded">
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
