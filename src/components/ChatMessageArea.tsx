import { ScrollArea } from '../components/ui/scroll-area';
import { MessageBubble } from '../components/MessageBubble';
import { useChat } from '../context/ChatContext';

export function ChatMessageArea() {
    const { messages, user } = useChat();
    return (
        <ScrollArea className="flex-1 min-h-0 p-4">
            {messages.map((m, i) => (
                <MessageBubble key={i} message={m} currentUsername={user?.username || ''} />
            ))}
        </ScrollArea>
    );
}
