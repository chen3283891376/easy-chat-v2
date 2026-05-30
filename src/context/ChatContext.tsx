import type { ReactNode } from 'react';
import { UserProvider } from './user-context';
import { RoomProvider } from './room-context';
import { MessageProvider } from './message-context';
import { SyncProvider } from './sync-context';

export function ChatProvider({ children }: { children: ReactNode }) {
    return (
        <UserProvider>
            <RoomProvider>
                <MessageProvider>
                    {children}
                    <SyncProvider />
                </MessageProvider>
            </RoomProvider>
        </UserProvider>
    );
}

export { useChat } from './use-chat';
