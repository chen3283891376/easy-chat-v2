import { Avatar, AvatarFallback } from './ui/avatar'
import { User } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MessageProps {
    message: {
        user: string
        msg: string
        time: Date
    }
    isCurrentUser: boolean
}

export function MessageBuddle({ message, isCurrentUser }: MessageProps) {
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
                            <div
                                className={cn(
                                    'rounded-2xl shadow-sm',
                                    isCurrentUser
                                        ? 'bg-primary text-background rounded-br-none px-4 py-2'
                                        : 'bg-surface border border-border text-text-primary rounded-bl-none px-4 py-2',
                                )}
                            >
                                <p className="text-sm wrap-break-word whitespace-pre-wrap">
                                    {msg}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
