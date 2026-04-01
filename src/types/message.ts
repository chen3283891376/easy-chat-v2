export interface WSMsgData {
    msg: {
        name: string
        content: string
        time: number
    }
}

export interface Attachment {
    name: string
    link: string
    size: string
    time: string
}

export interface Message {
    id: string
    name: string
    content: string
    time: number
    quote?: Message
    recalled?: boolean
    attachments?: Attachment[]
}
