import React from 'react'
import { MessageBuddle } from './components/MessageBuddle'
import { formatTime } from './lib/utils'
import { ScrollArea } from './components/ui/scroll-area'
import SignUpPage from './SignUpPage'
import { Input } from './components/ui/input'
import { Button } from './components/ui/button'
import { decrypt, encrypt } from './lib/crypto'
import { SendIcon } from 'lucide-react'
import type { Message as IMessage, WSMsgData } from './types/message'

function App() {
    const wsRef = React.useRef<WebSocket | null>(null)
    const saveTimerRef = React.useRef<number | null>(null)
    const [messages, setMessages] = React.useState<IMessage[]>([])
    const [sendMessage, setSendMessage] = React.useState('')
    const [isSending, setIsSending] = React.useState(false)

    const currentUsername = localStorage.getItem('username')
    const currentRoom =
        new URLSearchParams(window.location.search).get('room') || 123456789

    if (!currentUsername) {
        return SignUpPage()
    }
    React.useEffect(() => {
        const ws = new WebSocket('wss://ws.asilu.com:8090/')
        wsRef.current = ws
        ws.onopen = () => {
            ws.send(JSON.stringify({ name: currentUsername }))
        }
        ws.onmessage = async (event) => {
            const data: WSMsgData = JSON.parse(event.data)
            if (data.msg) {
                try {
                    const content: IMessage = JSON.parse(
                        await decrypt(data.msg.content, currentRoom),
                    )
                    const decryptedContent = content.content
                    setMessages((prev) => [
                        ...prev,
                        {
                            name: data.msg.name,
                            content: decryptedContent,
                            time: data.msg.time,
                            quote: content.quote,
                        },
                    ])
                } catch {
                    // 说明不是这个房间的消息，忽略
                }
            }
        }

        return () => {
            ws.close()
            if (saveTimerRef.current) {
                clearInterval(saveTimerRef.current)
            }
        }
    }, [currentRoom, currentUsername])

    return (
        <div className="flex-1 flex flex-col h-full">
            <ScrollArea className="flex-1 min-h-0 p-4">
                {messages.map((msg, index) => (
                    <MessageBuddle
                        key={index}
                        message={{
                            user: msg.name,
                            msg: msg.content,
                            time: formatTime(msg.time),
                        }}
                        isCurrentUser={msg.name === currentUsername}
                    />
                ))}
            </ScrollArea>
            <div className="p-3 flex flex-col bg-white border-t shrink-0 max-h-45 overflow-y-auto">
                <div className="flex gap-2 items-center shrink-0">
                    <Input
                        placeholder="请输入文本"
                        className="flex-1"
                        value={sendMessage}
                        onChange={(e) => setSendMessage(e.target.value)}
                        disabled={isSending}
                    />
                    <Button
                        size={'icon-sm'}
                        onClick={async () => {
                            if (sendMessage && !isSending) {
                                setIsSending(true)
                                try {
                                    const encrypted = await encrypt(
                                        JSON.stringify({
                                            content: sendMessage,
                                        }),
                                        currentRoom,
                                    )
                                    !wsRef.current?.CONNECTING &&
                                        wsRef.current?.send(
                                            JSON.stringify({
                                                msg: encrypted,
                                            }),
                                        )
                                    setSendMessage('')
                                } finally {
                                    setIsSending(false)
                                }
                            }
                        }}
                        disabled={isSending || sendMessage.length === 0}
                    >
                        <SendIcon className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </div>
    )
}

export default App
