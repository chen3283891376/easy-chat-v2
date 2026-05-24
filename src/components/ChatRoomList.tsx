import { Button } from '../components/ui/button';
import { ScrollArea } from '../components/ui/scroll-area';
import { useChat } from '../context/ChatContext';

export function ChatRoomList() {
    const { roomList, currentRoom, switchToRoom } = useChat();
    return (
        <ScrollArea className="h-[65vh] pr-2">
            <div className="space-y-1">
                {roomList.map(room => (
                    <Button
                        key={room.id}
                        variant={room.id === currentRoom.id ? 'default' : 'ghost'}
                        className="w-full justify-start"
                        onClick={() => switchToRoom(room)}
                    >
                        # {room.name}
                    </Button>
                ))}
            </div>
        </ScrollArea>
    );
}
