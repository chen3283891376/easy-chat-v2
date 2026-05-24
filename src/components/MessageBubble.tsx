import { AvatarGroupCount } from '@/components/ui/avatar';
import { useChat, type ChatMessage } from '@/context/ChatContext';
import { formatTime } from '@/lib/time.ts';
import { cn } from '@/lib/utils';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuGroup,
    ContextMenuItem,
    ContextMenuTrigger,
} from './ui/context-menu';
import { QuoteIcon } from 'lucide-react';

type MessageBubbleProps = {
    message: ChatMessage;
    currentUsername: string;
};

export const MessageBubble = ({ message, currentUsername }: MessageBubbleProps) => {
    const { setQuoteMessage } = useChat();
    const isCurrentUser = message.username === currentUsername;

    return (
        <div className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'} mb-4`}>
            <div className={`max-w-[70%] flex items-start gap-3 ${isCurrentUser ? 'flex-row-reverse' : ''}`}>
                <AvatarGroupCount>{message.username ? message.username[0] : '?'}</AvatarGroupCount>
                <div className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'} mb-2`}>
                    <div
                        className={`flex flex-col max-w-xs sm:max-w-sm lg:max-w-md ${
                            isCurrentUser ? 'items-end' : 'items-start'
                        }`}
                    >
                        <div className={`flex gap-1 min-w-12 ${isCurrentUser ? 'items-end' : 'items-start'}`}>
                            <span className="text-xs truncate">{message.username}</span>
                            <span className="text-xs">{formatTime(message.time)}</span>
                        </div>
                        <div className={`flex items-end gap-2 ${isCurrentUser ? 'flex-row-reverse' : 'flex-row'}`}>
                            <ContextMenu>
                                <ContextMenuTrigger>
                                    <div
                                        className={`rounded-2xl px-4 py-2 shadow-sm ${
                                            isCurrentUser
                                                ? 'bg-primary text-(--color-background) rounded-br-none'
                                                : 'bg-surface border border-border text-text-primary rounded-bl-none'
                                        }`}
                                    >
                                        {message.quote && (
                                            <div
                                                className={cn(
                                                    'text-xs p-2 mb-2 rounded border-l-4 overflow-hidden',
                                                    isCurrentUser
                                                        ? 'bg-indigo-900/30 border-indigo-400 text-indigo-100'
                                                        : 'bg-slate-50 border-slate-400 text-slate-800',
                                                )}
                                            >
                                                <p className="font-bold mb-0.5">@{message.quote.username}</p>
                                                <div className="prose prose-sm max-w-none prose-p:my-0 prose-headings:my-1 prose-ul:my-0 prose-ol:my-0 prose-li:my-0 prose-pre:my-1">
                                                    {message.quote.msg}
                                                </div>
                                            </div>
                                        )}
                                        <p className="text-sm wrap-break-word whitespace-pre-wrap">{message.msg}</p>
                                    </div>
                                </ContextMenuTrigger>
                                <ContextMenuContent side="bottom">
                                    <ContextMenuGroup>
                                        <ContextMenuItem
                                            onClick={() =>
                                                setQuoteMessage?.({
                                                    username: message.username,
                                                    time: message.time,
                                                    msg: message.msg,
                                                })
                                            }
                                        >
                                            <QuoteIcon />
                                            引用
                                        </ContextMenuItem>
                                    </ContextMenuGroup>
                                </ContextMenuContent>
                            </ContextMenu>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
