import { createContext, useContext, useState, type ReactNode } from 'react';
import type { User } from '@/types/message';
import { storage } from '../lib/storage';

interface UserContextType {
    user: User | null;
    privateKey: string;
    setUser: (user: User | null, privateKey?: string) => void;
    logout: () => void;
    changeUsername: (newUsername: string) => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
    const [user, setUserState] = useState<User | null>(null);
    const [privateKey, setPrivateKeyState] = useState('');

    const setUser = (user: User | null, pk = '') => {
        setUserState(user);
        setPrivateKeyState(pk);

        (async () => {
            try {
                if (user && pk) {
                    const roomsStr: unknown = await storage.getRooms(user.username, {
                        username: user.username,
                        privateKey: pk,
                    });
                    if (roomsStr) {
                        const parsed = JSON.parse(roomsStr as string);
                        if (Array.isArray(parsed)) {
                            localStorage.setItem('chat-rooms', JSON.stringify(parsed));
                        }
                    }
                }
            } catch {
                /* empty */
            }
        })();
    };

    const changeUsername = async (newUsername: string) => {
        if (!user) throw new Error('未登录');
        if (!privateKey) throw new Error('私钥不可用');
        await storage.changeUsername(user.username, newUsername, { username: user.username, privateKey });

        // update local state and localStorage
        const updatedUser = { ...user, username: newUsername } as User;
        setUserState(updatedUser);
        localStorage.setItem('chat-user', newUsername);
        // keep key unlocked marker in sync
        localStorage.setItem('chat-key-unlocked', newUsername);
    };

    const logout = () => {
        setUser(null, '');
        localStorage.clear();
        location.reload();
    };

    return (
        <UserContext.Provider value={{ user, privateKey, setUser, logout, changeUsername }}>
            {children}
        </UserContext.Provider>
    );
}

export const useUser = () => {
    const ctx = useContext(UserContext);
    if (!ctx) throw new Error('useUser must be used within UserProvider');
    return ctx;
};
