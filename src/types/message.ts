export interface ChatMessage {
    id: string;
    username: string;
    msg: string;
    time: number;
    publicKey?: string;
    sig?: string;
    nonce?: string;
    quoteId?: string;
    recalled?: boolean;
    type?: 'name' | 'share' | 'recall';
}

export interface User {
    username: string;
    publicKey: string;
}

export interface Room {
    id: string; // 唯一ID（业务标识）
    name: string; // 显示名称
}
