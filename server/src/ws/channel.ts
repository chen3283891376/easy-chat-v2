/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ServerWebSocket } from "bun";
import type { ConnectionMeta, JoinEvent, LeaveEvent, UserInfo } from "../types";
import { db } from "../db";

export const channels = new Map<string, Set<ServerWebSocket<ConnectionMeta>>>();
export const channelGlobalMessages = new Map<string, any[]>();

export function generateUID(): string {
    return crypto.randomUUID();
}

export function sendJSON(ws: ServerWebSocket<ConnectionMeta>, data: any) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

export function broadcast(
    channelId: string,
    data: any,
    exclude?: ServerWebSocket<ConnectionMeta>,
    only?: ServerWebSocket<ConnectionMeta>,
) {
    const sockets = channels.get(channelId);
    if (!sockets) return;
    const payload = JSON.stringify(data);
    for (const ws of sockets) {
        if (ws.readyState !== WebSocket.OPEN) continue;
        if (only && ws !== only) continue;
        if (!only && exclude && ws === exclude) continue;
        ws.send(payload);
    }
}

export function getChannelUsers(channelId: string): UserInfo[] {
    const sockets = channels.get(channelId);
    if (!sockets) return [];
    return Array.from(sockets)
        .filter((ws) => ws.readyState === WebSocket.OPEN)
        .map((ws) => ({ uid: ws.data.uid, alias: ws.data.alias }));
}

export function getChannelTotal(channelId: string): number {
    const sockets = channels.get(channelId);
    if (!sockets) return 0;
    return Array.from(sockets).filter((ws) => ws.readyState === WebSocket.OPEN).length;
}

export function handleJoin(ws: ServerWebSocket<ConnectionMeta>) {
    const { channelId, uid, alias, announce, list } = ws.data;

    if (!channels.has(channelId)) {
        channels.set(channelId, new Set());
        channelGlobalMessages.set(channelId, []);
    }
    channels.get(channelId)!.add(ws);

    const now = Date.now();
    const users = list ? getChannelUsers(channelId) : undefined;
    const total = getChannelTotal(channelId);

    const joinToSelf: JoinEvent = {
        type: "join",
        date: now,
        uid,
        alias,
        total,
        self: true,
        users,
    };
    sendJSON(ws, joinToSelf);

    if (announce) {
        const joinToOthers: JoinEvent = {
            type: "join",
            date: now,
            uid,
            alias,
            total,
            self: false,
        };
        broadcast(channelId, joinToOthers, ws);
    }
}

export async function handleLeave(ws: ServerWebSocket<ConnectionMeta>) {
    const { channelId, uid, alias, announce } = ws.data;
    const sockets = channels.get(channelId);
    if (sockets) {
        sockets.delete(ws);
        if (sockets.size === 0) channels.delete(channelId);
    }

    if (announce) {
        const now = Date.now();
        const total = getChannelTotal(channelId);
        const leaveEvent: LeaveEvent = {
            type: "leave",
            date: now,
            uid,
            alias,
            total,
        };
        broadcast(channelId, leaveEvent);
    }

    const fullChannelMsgs = channelGlobalMessages.get(channelId) ?? [];
    const appendList = fullChannelMsgs.map((item) => JSON.parse(item));

    await db.read();
    const historyRaw = db.data.variables[channelId] || "[]";
    const history = JSON.parse(historyRaw);

    const allRaw = [...history, ...appendList];
    const uniqueMap = new Map<string, any>();
    for (const msg of allRaw) {
        if (msg?.id) uniqueMap.set(msg.id, msg);
    }
    const uniqueMessages = Array.from(uniqueMap.values());

    db.data.variables[channelId] = JSON.stringify(uniqueMessages);
    await db.write();
    channelGlobalMessages.set(channelId, []);
}

export function parsePrivateMessage(raw: string): { targetUID: string; jsonString: string } | null {
    if (!raw.startsWith("\x1F")) return null;
    const secondIdx = raw.indexOf("\x1F", 1);
    if (secondIdx === -1) return null;
    const targetUID = raw.slice(1, secondIdx);
    const jsonString = raw.slice(secondIdx + 1);
    return { targetUID, jsonString };
}

export function findSocketByUID(channelId: string, uid: string) {
    const sockets = channels.get(channelId);
    if (!sockets) return undefined;
    for (const ws of sockets) {
        if (ws.data.uid === uid && ws.readyState === WebSocket.OPEN) return ws;
    }
    return undefined;
}
