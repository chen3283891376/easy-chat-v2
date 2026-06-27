import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Room } from '@/types/message';
import { genRoomId } from '../lib/utils';
import { useUser } from './user-context';
import { storage } from '../lib/storage';
import { eventBus } from './event-bus';

interface RoomContextType {
    currentRoom: Room;
    roomList: Room[];
    editingRoomName: string;
    setEditingRoomName: (name: string) => void;
    setEditingRoom: (room: Room | null) => void;
    createRoom: (roomName: string) => Promise<void>;
    joinRoomById: (roomId: string, roomName: string) => Promise<void>;
    switchToRoom: (room: Room) => Promise<void>;
    setRoomList: (rooms: Room[]) => Promise<void>;
    editRoomName: () => Promise<void>;
}

const RoomContext = createContext<RoomContextType | undefined>(undefined);

export function RoomProvider({ children }: { children: ReactNode }) {
    const { user, privateKey } = useUser();
    const [currentRoom, setCurrentRoom] = useState<Room>({ id: 'room_default', name: '默认房间' });
    const [roomList, setRoomListState] = useState<Room[]>(() => {
        const saved = localStorage.getItem('chat-rooms');
        return saved ? JSON.parse(saved) : [{ id: 'room_default', name: '默认房间' }];
    });

    const [editingRoomName, setEditingRoomName] = useState('');
    const [editingRoom, setEditingRoom] = useState<Room | null>(null);

    useEffect(() => {
        localStorage.setItem('chat-rooms', JSON.stringify(roomList));
    }, [roomList]);

    useEffect(() => {
        const handler = ({ data }: { data: Room[] }) => {
            setRoomListState(data);
        };
        eventBus.on('changeRooms', handler);
        return () => eventBus.off('changeRooms', handler);
    }, []);

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
        setEditingRoomName(room.name);
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

    const editRoomName = async () => {
        if (editingRoomName === editingRoom?.name) return;
        const updated = roomList.map(r => (r.id === editingRoom?.id ? { ...r, name: editingRoomName } : r));
        await setRoomList(updated);
    };

    return (
        <RoomContext.Provider
            value={{
                currentRoom,
                editingRoomName,
                roomList,
                setEditingRoomName,
                setEditingRoom,
                createRoom,
                joinRoomById,
                switchToRoom,
                setRoomList,
                editRoomName,
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
