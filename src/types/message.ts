export interface WSMsgData {
    msg: {
        name: string
        content: string
        time: number
    }
}

export interface Message {
    name: string
    content: string
    time: number
    quote?: Message
}
