export interface WSMsgData {
    msg: {
        name: string
        content: string
        time: number
    }
}

export interface Message {
    id: string
    name: string
    content: string
    time: number
    quote?: Message
    recalled?: boolean
}
