import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Room } from '@/types/message';
import { genRoomId } from '../lib/utils';
import { useUser } from './user-context';
import { storage } from '../lib/storage';

interface RoomContextType {
    currentRoom: Room;
    roomList: Room[];
    createRoom: (roomName: string) => Promise<void>;
    joinRoomById: (roomId: string, roomName: string) => Promise<void>;
    switchToRoom: (room: Room) => Promise<void>;
    setRoomList: (rooms: Room[]) => Promise<void>;
    // open a direct message as a room between current user and other username
    openDMWith: (otherUsername: string) => Promise<void>;
}

const RoomContext = createContext<RoomContextType | undefined>(undefined);

export function RoomProvider({ children }: { children: ReactNode }) {
    const { user, privateKey } = useUser();
    const [currentRoom, setCurrentRoom] = useState<Room>({ id: 'room_default', name: '默认房间' });
    const [roomList, setRoomListState] = useState<Room[]>(() => {
        const saved = localStorage.getItem('chat-rooms');
        return saved ? JSON.parse(saved) : [{ id: 'room_default', name: '默认房间' }];
    });

    useEffect(() => {
        localStorage.setItem('chat-rooms', JSON.stringify(roomList));
    }, [roomList]);

    const setRoomList = async (rooms: Room[]) => {
        setRoomListState(rooms);
        try {
            if (user && privateKey) {
                await storage.setRooms(user.username, JSON.stringify(rooms), {
                    username: user.username,
                    privateKey,
                });
            }
        } catch {
            /* empty */
        }
    };

    const switchToRoom = async (room: Room) => {
        setCurrentRoom(room);
    };

    const createRoom = async (roomName: string) => {
        const id = genRoomId();
        const newRoom: Room = { id, name: roomName };
        const updated = roomList.some(r => r.id === id) ? roomList : [...roomList, newRoom];
        await setRoomList(updated);
        await switchToRoom(newRoom);
    };

    const joinRoomById = async (roomId: string, roomName: string) => {
        const target = roomList.find(r => r.id === roomId);
        if (target) {
            await switchToRoom(target);
            return;
        }
        const newRoom: Room = { id: roomId, name: roomName };
        const updated = [...roomList, newRoom];
        await setRoomList(updated);
        await switchToRoom(newRoom);
    };

    const openDMWith = async (otherUsername: string) => {
        const me = user?.username || '';
        if (!me) return;
        const id = `dm_${[me, otherUsername].sort().join('|')}`;
        const name = `私聊：${otherUsername}`;
        await joinRoomById(id, name);
    };

    return (
        <RoomContext.Provider
            value={{
                currentRoom,
                roomList,
                createRoom,
                joinRoomById,
                switchToRoom,
                setRoomList,
                openDMWith,
            }}
        >
            {children}
        </RoomContext.Provider>
    );
}

export const useRoom = () => {
    const ctx = useContext(RoomContext);
    if (!ctx) throw new Error('useRoom must be used within RoomProvider');
    return ctx;
};
