import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";

export type DBData = {
    variables: Record<string, string>;
    user_data: Record<
        string,
        {
            publicKey: string;
            encryptedPrivate: string;
            rooms: string;
            avatarUrl: string;
        }
    >;
    private_messages: Record<string, string>;
    dm_invitations: Record<string, string[]>;
};

// 全局单例 DB
export const db = new Low<DBData>(new JSONFile("db.json"), {
    variables: {},
    user_data: {},
    private_messages: {},
    dm_invitations: {},
});
await db.read();

export type Data = {
    key: string;
    value: string;
    username: string;
    time: number;
    sig: string;
    nonce: string;
};
