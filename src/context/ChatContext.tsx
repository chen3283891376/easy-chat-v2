import type { ReactNode } from 'react';
import { UserProvider } from './user-context';
import { RoomProvider } from './room-context';
import { MessageProvider } from './message-context';

export function ChatProvider({ children }: { children: ReactNode }) {
    return (
        <UserProvider>
            <RoomProvider>
                <MessageProvider>{children}</MessageProvider>
            </RoomProvider>
        </UserProvider>
    );
}

export { useChat } from './use-chat';
