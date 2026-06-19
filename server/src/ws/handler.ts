import type { ServerWebSocket } from "bun";
import type { ConnectionMeta, ErrorEvent, MessageEvent } from "../types";
import {
    sendJSON,
    broadcast,
    parsePrivateMessage,
    findSocketByUID,
    handleJoin,
    handleLeave,
    channelGlobalMessages,
} from "./channel";

export function wsOpen(ws: ServerWebSocket<ConnectionMeta>) {
    handleJoin(ws);
}

export function wsMessage(ws: ServerWebSocket<ConnectionMeta>, rawMessage: string | Buffer) {
    const meta = ws.data;
    const now = Date.now();
    const channelId = meta.channelId;
    const globalMsgList = channelGlobalMessages.get(channelId)!;

    const rawStr = typeof rawMessage === "string" ? rawMessage : Buffer.from(rawMessage).toString();
    const privateData = parsePrivateMessage(rawStr);
    let jsonStr: string;
    let targetUID: string | undefined;

    if (privateData) {
        targetUID = privateData.targetUID;
        jsonStr = privateData.jsonString;
    } else {
        jsonStr = rawStr;
    }

    let parsedMessage;
    try {
        parsedMessage = JSON.parse(jsonStr);
        if (!(parsedMessage.type === "message")) {
            globalMsgList.push(parsedMessage);
        }
    } catch {
        const errorEvent: ErrorEvent = {
            type: "error",
            date: now,
            message: "Invalid JSON",
        };
        sendJSON(ws, errorEvent);
        return;
    }

    const messagePayload: MessageEvent = {
        date: now,
        uid: meta.uid,
        alias: meta.alias,
        message: parsedMessage,
    };

    if (targetUID) {
        const targetSocket = findSocketByUID(meta.channelId, targetUID);
        if (targetSocket) {
            sendJSON(targetSocket, messagePayload);
            if (meta.echo && targetSocket !== ws) {
                sendJSON(ws, messagePayload);
            }
        }
    } else {
        const exclude = meta.echo ? undefined : ws;
        broadcast(meta.channelId, messagePayload, exclude);
    }
}

export async function wsClose(ws: ServerWebSocket<ConnectionMeta>) {
    await handleLeave(ws);
}
