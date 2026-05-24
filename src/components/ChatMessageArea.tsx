import { ScrollArea } from '../components/ui/scroll-area';
import { MessageBubble } from '../components/MessageBubble';
import { useChat } from '../context/ChatContext';

export function ChatMessageArea() {
    const { messages, user } = useChat();
    return (
        <ScrollArea className="flex-1 p-4 h-[calc(100vh-64px)]">
            <div className="space-y-4">
                {messages.map((m, i) => (
                    <MessageBubble key={i} message={m} currentUsername={user?.username || ''} />
                ))}
            </div>
        </ScrollArea>
    );
}
