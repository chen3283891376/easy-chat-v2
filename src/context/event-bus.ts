import mitt from 'mitt';
import type { Room } from '@/types/message';

type Events = {
    changeRooms: { data: Room[] };
};
export const eventBus = mitt<Events>();
