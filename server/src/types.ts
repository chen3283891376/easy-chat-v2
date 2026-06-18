/* eslint-disable @typescript-eslint/no-explicit-any */
export type UserInfo = {
    uid: string;
    alias?: string;
};

export type JoinEvent = {
    type: "join";
    date: number;
    uid: string;
    alias?: string;
    total: number;
    self: boolean;
    users?: UserInfo[];
};

export type LeaveEvent = {
    type: "leave";
    date: number;
    uid: string;
    alias?: string;
    total: number;
};

export type ErrorEvent = {
    type: "error";
    date: number;
    message: string;
};

export type MessageEvent = {
    date: number;
    uid: string;
    alias?: string;
    message: any;
};

export type ConnectionMeta = {
    uid: string;
    alias?: string;
    channelId: string;
    echo: boolean;
    announce: boolean;
    list: boolean;
};
