import React from 'react';
import { AvatarGroupCount } from '@/components/ui/avatar';
import { useChat } from '@/context/ChatContext';
import { formatTime } from '@/lib/time.ts';
import { cn } from '@/lib/utils';
import { verifyMessage } from '@/lib/ed25519';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuGroup,
    ContextMenuItem,
    ContextMenuTrigger,
} from './ui/context-menu';
import { QuoteIcon, UndoIcon } from 'lucide-react';
import type { ChatMessage } from '@/types/message';

type MessageBubbleProps = {
    message: ChatMessage;
    currentUsername: string;
};

export const MessageBubble = ({ message, currentUsername }: MessageBubbleProps) => {
    const { setQuoteMsgId, recallMessage, messages, publicKeyMap } = useChat();

    // Resolve display name by verifying signature against known public keys.
    const resolveDisplayName = async () => {
        if (!message.sig) return message.username;
        try {
            for (const [uname, pub] of Object.entries(publicKeyMap || {})) {
                try {
                    const ok = await verifyMessage(
                        message.msg,
                        message.username,
                        message.time,
                        message.sig || '',
                        pub,
                        message.nonce || '',
                    );
                    if (ok) return uname;
                } catch {}
            }
        } catch {}
        return message.username;
    };

    const [displayName, setDisplayName] = React.useState<string>(message.username);

    React.useEffect(() => {
        let mounted = true;
        (async () => {
            const name = await resolveDisplayName();
            if (mounted) setDisplayName(name);
        })();
        return () => {
            mounted = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [message.username, message.msg, message.sig, message.time, JSON.stringify(publicKeyMap)]);

    const isCurrentUser = displayName === currentUsername;
    const quoteMessage = message.quoteId ? messages.find(m => m.id === message.quoteId) : null;
    const [quoteDisplayName, setQuoteDisplayName] = React.useState<string | undefined>(quoteMessage?.username);

    React.useEffect(() => {
        let mounted = true;
        (async () => {
            if (!quoteMessage || !quoteMessage.sig) return;
            try {
                for (const [uname, pub] of Object.entries(publicKeyMap || {})) {
                    try {
                        const ok = await verifyMessage(
                            quoteMessage.msg,
                            quoteMessage.username,
                            quoteMessage.time,
                            quoteMessage.sig || '',
                            pub,
                            quoteMessage.nonce || '',
                        );
                        if (ok && mounted) {
                            setQuoteDisplayName(uname);
                            return;
                        }
                    } catch {}
                }
            } catch {}
        })();
        return () => {
            mounted = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [quoteMessage?.id, JSON.stringify(publicKeyMap)]);

    return (
        <div className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'} mb-4`}>
            <div className={`max-w-[70%] flex items-start gap-3 ${isCurrentUser ? 'flex-row-reverse' : ''}`}>
                <AvatarGroupCount>
                    {displayName ? displayName[0] : message.username ? message.username[0] : '?'}
                </AvatarGroupCount>
                <div className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'} mb-2`}>
                    <div
                        className={`flex flex-col max-w-xs sm:max-w-sm lg:max-w-md ${
                            isCurrentUser ? 'items-end' : 'items-start'
                        }`}
                    >
                        <div className={`flex gap-1 min-w-12 ${isCurrentUser ? 'items-end' : 'items-start'}`}>
                            <span className="text-xs truncate">{displayName}</span>
                            <span className="text-xs">{formatTime(message.time)}</span>
                        </div>
                        <div className={`flex items-end gap-2 ${isCurrentUser ? 'flex-row-reverse' : 'flex-row'}`}>
                            <ContextMenu>
                                <ContextMenuTrigger>
                                    <div
                                        className={
                                            !message.recalled
                                                ? `rounded-2xl px-4 py-2 shadow-sm ${
                                                      isCurrentUser
                                                          ? 'bg-primary text-(--color-background) rounded-br-none'
                                                          : 'bg-surface border border-border text-text-primary rounded-bl-none'
                                                  }`
                                                : ''
                                        }
                                    >
                                        {message.quoteId && (
                                            <div
                                                className={cn(
                                                    'text-xs p-2 mb-2 rounded border-l-4 overflow-hidden',
                                                    isCurrentUser
                                                        ? 'bg-indigo-900/30 border-indigo-400 text-indigo-100'
                                                        : 'bg-slate-50 border-slate-400 text-slate-800',
                                                )}
                                            >
                                                <p className="font-bold mb-0.5">
                                                    @{quoteDisplayName || quoteMessage?.username}
                                                </p>
                                                <div
                                                    className={cn(
                                                        'prose prose-sm max-w-none prose-p:my-0 prose-headings:my-1 prose-ul:my-0 prose-ol:my-0 prose-li:my-0 prose-pre:my-1',
                                                        quoteMessage?.recalled && 'text-secondary italic',
                                                    )}
                                                >
                                                    {quoteMessage?.recalled ? '消息已撤回' : quoteMessage?.msg}
                                                </div>
                                            </div>
                                        )}
                                        <p
                                            className={cn(
                                                'text-sm wrap-break-word whitespace-pre-wrap',
                                                message.recalled && 'text-secondary-foreground italic',
                                            )}
                                        >
                                            {message.recalled ? '消息已撤回' : message.msg}
                                        </p>
                                    </div>
                                </ContextMenuTrigger>
                                <ContextMenuContent side="bottom">
                                    <ContextMenuGroup>
                                        <ContextMenuItem onClick={() => setQuoteMsgId(message.id)}>
                                            <QuoteIcon />
                                            引用
                                        </ContextMenuItem>
                                        {isCurrentUser && (
                                            <ContextMenuItem onClick={() => recallMessage(message.id)}>
                                                <UndoIcon />
                                                撤回
                                            </ContextMenuItem>
                                        )}
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
