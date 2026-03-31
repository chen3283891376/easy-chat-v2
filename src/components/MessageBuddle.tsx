import { Avatar, AvatarFallback } from './ui/avatar'
import { QuoteIcon, User } from 'lucide-react'
import type { Message as IMessage } from '@/types/message'
import { cn } from '@/lib/utils'
import { ContextMenu, ContextMenuContent, ContextMenuGroup, ContextMenuItem, ContextMenuTrigger } from './ui/context-menu'

interface MessageProps {
    message: {
        user: string
        msg: string
        time: Date
        quote?: IMessage
    }
    isCurrentUser: boolean;
    setQuoteMessage?: (message: IMessage | null) => void;
}

export function MessageBuddle({ message, isCurrentUser, setQuoteMessage }: MessageProps) {
    const { user, msg, time } = message
    const formattedTime = time.toLocaleTimeString()

    return (
        <div
            className={`flex mb-4 ${isCurrentUser ? 'justify-end' : 'justify-start'}`}
        >
            <div
                className={cn(
                    'max-w-[70%] flex items-start gap-3',
                    isCurrentUser && 'flex-row-reverse',
                )}
            >
                <Avatar className="shrink-0 h-8 w-8">
                    <AvatarFallback>
                        <User className="h-4 w-4" />
                    </AvatarFallback>
                </Avatar>
                <div
                    className={cn(
                        'flex mb-2',
                        isCurrentUser ? 'justify-end' : 'justify-start',
                    )}
                >
                    <div
                        className={cn(
                            'flex flex-col max-w-xs sm:max-w-sm lg:max-w-md',
                            isCurrentUser ? 'items-end' : 'items-start',
                        )}
                    >
                        <div
                            className={cn(
                                'flex gap-1 min-w-12',
                                isCurrentUser ? 'items-end' : 'items-start',
                            )}
                        >
                            <span className="text-xs truncate">{user}</span>
                            <span className="text-xs">{formattedTime}</span>
                        </div>

                        <div
                            className={cn(
                                'flex items-end gap-2',
                                isCurrentUser ? 'flex-row-reverse' : 'flex-row',
                            )}
                        >
                            <ContextMenu>
                                <ContextMenuTrigger>
                                    <div
                                        className={cn(
                                            'rounded-2xl shadow-sm',
                                            isCurrentUser
                                                ? 'bg-primary text-background rounded-br-none px-4 py-2'
                                                : 'bg-surface border border-border text-text-primary rounded-bl-none px-4 py-2',
                                        )}
                                    >
                                        {message.quote && (
                                            <div
                                                className={cn(
                                                    "text-xs p-2 mb-2 rounded border-l-4 overflow-hidden",
                                                    isCurrentUser
                                                        ? "bg-indigo-900/30 border-indigo-400 text-indigo-100"
                                                        : "bg-slate-50 border-slate-400 text-slate-800",
                                                )}
                                            >
                                                <p className="font-bold mb-0.5">
                                                    @{message.quote.name}
                                                </p>
                                                <div className="prose prose-sm max-w-none prose-p:my-0 prose-headings:my-1 prose-ul:my-0 prose-ol:my-0 prose-li:my-0 prose-pre:my-1">
                                                    {message.quote.content}
                                                </div>
                                            </div>
                                        )}
                                        <p className="text-sm wrap-break-word whitespace-pre-wrap">
                                            {msg}
                                        </p>
                                    </div>
                                </ContextMenuTrigger>
                                <ContextMenuContent side="bottom">
                                    <ContextMenuGroup>
                                        <ContextMenuItem onClick={() => setQuoteMessage?.({
                                            name: user,
                                            content: msg,
                                            time: time.getTime(),
                                        })}>
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
    )
}
