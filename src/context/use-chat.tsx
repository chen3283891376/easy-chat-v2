import { useUser } from './user-context';
import { useRoom } from './room-context';
import { useMessage } from './message-context';

export function useChat() {
    const user = useUser();
    const room = useRoom();
    const message = useMessage();

    return {
        ...user,
        ...room,
        ...message,
    };
}
