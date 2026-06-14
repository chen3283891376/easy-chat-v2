/* eslint-disable @typescript-eslint/no-explicit-any */
// __coder__ = "Deepseek-V4-Pro"
import { serve, type ServerWebSocket } from "bun";
import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";

type UserInfo = {
    uid: string;
    alias?: string;
};

type JoinEvent = {
    type: "join";
    date: number;
    uid: string;
    alias?: string;
    total: number;
    self: boolean;
    users?: UserInfo[];
};

type LeaveEvent = {
    type: "leave";
    date: number;
    uid: string;
    alias?: string;
    total: number;
};

type ErrorEvent = {
    type: "error";
    date: number;
    message: string;
};

type MessageEvent = {
    date: number;
    uid: string;
    alias?: string;
    message: any;
};

// 服务端私有连接元数据：移除sessionMessages，不再按单用户缓存
type ConnectionMeta = {
    uid: string;
    alias?: string;
    channelId: string;
    echo: boolean;
    announce: boolean;
    list: boolean;
};

// 全局频道在线连接管理
const channels = new Map<string, Set<ServerWebSocket<ConnectionMeta>>>();
// 新增：全局频道完整消息池，存放整个聊天室所有普通聊天消息
const channelGlobalMessages = new Map<string, any[]>();

// 工具：生成唯一 uid
function generateUID(): string {
    return crypto.randomUUID();
}

// 工具：发送 JSON 消息给单个连接
function sendJSON(ws: ServerWebSocket<ConnectionMeta>, data: any) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

// 工具：向频道内广播消息，可选排除发送者或仅发送给特定目标
function broadcast(
    channelId: string,
    data: any,
    exclude?: ServerWebSocket<ConnectionMeta>,
    only?: ServerWebSocket<ConnectionMeta>
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

// 工具：获取频道所有用户信息
function getChannelUsers(channelId: string): UserInfo[] {
    const sockets = channels.get(channelId);
    if (!sockets) return [];
    return Array.from(sockets)
        .filter(ws => ws.readyState === WebSocket.OPEN)
        .map(ws => ({ uid: ws.data.uid, alias: ws.data.alias }));
}

// 工具：统计频道在线人数
function getChannelTotal(channelId: string): number {
    const sockets = channels.get(channelId);
    if (!sockets) return 0;
    return Array.from(sockets).filter(ws => ws.readyState === WebSocket.OPEN).length;
}

// 处理加入频道
function handleJoin(ws: ServerWebSocket<ConnectionMeta>) {
    const { channelId, uid, alias, announce, list } = ws.data;

    if (!channels.has(channelId)) {
        channels.set(channelId, new Set());
        // 新频道初始化全局消息数组
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

// 处理用户离开
function handleLeave(ws: ServerWebSocket<ConnectionMeta>) {
    const { channelId, uid, alias, announce } = ws.data;
    const sockets = channels.get(channelId);
    if (sockets) {
        sockets.delete(ws);
        // 频道无人在线时，保留全局消息缓存不销毁，避免丢记录
        if (sockets.size === 0) {
            channels.delete(channelId);
        }
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
}

// 解析私聊前缀：返回 { targetUID, jsonString } 或 null
function parsePrivateMessage(raw: string): { targetUID: string; jsonString: string } | null {
    if (!raw.startsWith("\x1F")) return null;
    const secondIdx = raw.indexOf("\x1F", 1);
    if (secondIdx === -1) return null;
    const targetUID = raw.slice(1, secondIdx);
    const jsonString = raw.slice(secondIdx + 1);
    return { targetUID, jsonString };
}

// 查找指定 uid 的连接（仅限同一频道）
function findSocketByUID(channelId: string, uid: string): ServerWebSocket<ConnectionMeta> | undefined {
    const sockets = channels.get(channelId);
    if (!sockets) return undefined;
    for (const ws of sockets) {
        if (ws.data.uid === uid && ws.readyState === WebSocket.OPEN) return ws;
    }
    return undefined;
}

// LowDB 数据库初始化
type DBData = {
    variables: Record<string, string>;
    user_data: Record<
        string,
        {
            publicKey: string;
            encryptedPrivate: string;
            rooms: string;
        }
    >;
    private_messages: Record<string, string>;
    dm_invitations: Record<string, string[]>;
};
const db = new Low<DBData>(new JSONFile("db.json"), {
    variables: {},
    user_data: {},
    private_messages: {},
    dm_invitations: {},
});
await db.read();

// ---------- Bun 服务启动 ----------
const server = serve({
    port: 3000,
    fetch(req, server) {
        const url = new URL(req.url);
        const match = url.pathname.match(/^\/c\/([^/]+)$/);
        if (!match) {
            return new Response("Not Found", { status: 404 });
        }

        const channelId = decodeURIComponent(match[1] || "");
        const params = url.searchParams;

        const alias = params.get("as") ?? params.get("alias") ?? undefined;
        const echo = params.get("echo") === "true";
        const announce = params.get("announce") !== "false";
        const list = params.get("list") !== "false";

        const upgraded = server.upgrade(req, {
            data: {
                uid: generateUID(),
                alias,
                channelId,
                echo,
                announce,
                list,
            } satisfies ConnectionMeta,
        });

        if (upgraded) return;
        return new Response("Upgrade failed", { status: 500 });
    },

    websocket: {
        open(ws) {
            handleJoin(ws);
        },

        message(ws, rawMessage) {
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

            let parsedMessage: any;
            try {
                parsedMessage = JSON.parse(jsonStr);
                // 你原有判断逻辑完全保留不动
                if (!(JSON.parse(parsedMessage).type === "message")) {
                    // 存入频道全局消息池（替代单用户sessionMessages）
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
        },

        async close(ws: ServerWebSocket<ConnectionMeta>) {
            handleLeave(ws);
            const meta = ws.data;
            const targetChannel = meta.channelId;
            const fullChannelMsgs = channelGlobalMessages.get(targetChannel) ?? [];
            const appendList = [];
            for (const i in fullChannelMsgs) {
                appendList.push(JSON.parse(fullChannelMsgs[i]));
            }

            await db.read();
            const historyRaw = db.data.variables[targetChannel] || "[]";
            const history = JSON.parse(historyRaw);

            const allRaw = [...history, ...appendList];
            const uniqueMap = new Map<string, any>();
            for (const msg of allRaw) {
                if (msg?.id) uniqueMap.set(msg.id, msg);
            }
            const uniqueMessages = Array.from(uniqueMap.values());

            db.data.variables[targetChannel] = JSON.stringify(uniqueMessages);
            await db.write();
        },
    },
});

console.log(`itty-socket 兼容服务端已启动 → ws://localhost:${server.port}`);