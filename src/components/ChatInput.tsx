import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { useChat } from '../context/ChatContext';
import { SendIcon, XIcon } from 'lucide-react';

export function ChatInput() {
    const { input, setInput, handleSend, quoteMsgId, setQuoteMsgId, messages } = useChat();
    const quoteMessage = quoteMsgId ? messages.find(m => m.id === quoteMsgId) : null;
    return (
        <div className="p-3 flex flex-col bg-white border-t shrink-0 max-h-45 overflow-y-auto">
            {quoteMsgId && (
                <div className="relative text-xs p-2 mb-2 rounded border-l-4 bg-slate-50 border-slate-400 text-slate-800">
                    <p className="font-bold mb-0.5">@{quoteMessage?.username}</p>
                    <div className="prose prose-sm max-w-none max-h-24 overflow-y-auto prose-p:my-0 prose-headings:my-1 prose-ul:my-0 prose-ol:my-0 prose-li:my-0 prose-pre:my-1">
                        {quoteMessage?.msg}
                    </div>
                    <Button
                        size="icon-xs"
                        className="absolute top-1 right-1"
                        onClick={() => {
                            setQuoteMsgId(null);
                        }}
                    >
                        <XIcon />
                    </Button>
                </div>
            )}
            <div className="flex gap-2 items-center shrink-0">
                <Input
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSend()}
                    placeholder="输入消息..."
                    className="flex-1"
                />
                <Button size={'icon'} onClick={handleSend}>
                    <SendIcon />
                </Button>
            </div>
        </div>
    );
}
