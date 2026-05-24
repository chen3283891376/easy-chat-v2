import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { useChat } from '../context/ChatContext';

export function ChatInput() {
    const { input, setInput, handleSend } = useChat();
    return (
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
    );
}
