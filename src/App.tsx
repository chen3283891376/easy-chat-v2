import React from 'react'
import { MessageBuddle } from './components/MessageBuddle'
import { formatTime } from './lib/utils'
import { ScrollArea } from './components/ui/scroll-area'
import SignUpPage from './SignUpPage'
import { Input } from './components/ui/input'
import { Button } from './components/ui/button'
import { decrypt, encrypt } from './lib/crypto'
import { FileUpIcon, SendIcon, XIcon } from 'lucide-react'
import type {
    Attachment,
    Message as IMessage,
    WSMsgData,
} from './types/message'
import { FileDisplay } from './components/FileDisplay'
import { useFileUpload } from './hooks/useFileUpload'
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './components/ui/dialog'
import UploadFile from './components/UploadFile'
import { Progress } from './components/ui/progress'

function App() {
    const wsRef = React.useRef<WebSocket | null>(null)
    const saveTimerRef = React.useRef<number | null>(null)
    const [messages, setMessages] = React.useState<IMessage[]>([])
    const [sendMessage, setSendMessage] = React.useState('')
    const [quoteMessage, setQuoteMessage] = React.useState<IMessage | null>(
        null,
    )
    const [attachments, setAttachments] = React.useState<Attachment[]>([])
    const [isSending, setIsSending] = React.useState(false)

    const { upload, isUploading, uploadProgress } = useFileUpload()
    const [open, setOpen] = React.useState(false);
    const [selectedFile, setSelectedFile] = React.useState<File | null>(null);

    const genMessageId = () =>
        `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`

    const currentUsername = localStorage.getItem('username')
    const currentRoom =
        new URLSearchParams(window.location.search).get('room') || 123456789

    if (!currentUsername) {
        return SignUpPage()
    }

    const recallMessage = async (messageId: string) => {
        setMessages((prev) =>
            prev.map((msg) =>
                msg.id === messageId ? { ...msg, recalled: true } : msg,
            ),
        )

        try {
            const recallPayload = { recall: true, id: messageId }
            const encrypted = await encrypt(
                JSON.stringify(recallPayload),
                currentRoom,
            )
            !wsRef.current?.CONNECTING &&
                wsRef.current?.send(JSON.stringify({ msg: encrypted }))
        } catch (e) {
            console.error('recall send failed', e)
        }
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
                    const parsed = JSON.parse(
                        await decrypt(data.msg.content, currentRoom),
                    )

                    if (parsed && parsed.recall && parsed.id) {
                        setMessages((prev) =>
                            prev.map((m) =>
                                m.id === parsed.id
                                    ? { ...m, recalled: true }
                                    : m,
                            ),
                        )
                        return
                    }

                    const content: IMessage = parsed
                    const decryptedContent = content.content
                    setMessages((prev) => [
                        ...prev,
                        {
                            id: content.id || genMessageId(),
                            name: data.msg.name,
                            content: decryptedContent,
                            time: data.msg.time,
                            quote: content.quote,
                            attachments: content.attachments,
                        },
                    ])
                } catch (err) {
                    // 说明不是这个房间的消息或解密失败，忽略
                    // console.error('ws message handle error', err)
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

    const handleSend = async () => {
        if ((sendMessage.trim() !== '' || attachments.length !== 0) && !isSending) {
            setIsSending(true)
            try {
                const messagePayload = {
                    id: genMessageId(),
                    content: sendMessage,
                    quote: quoteMessage,
                    attachments,
                }

                const encrypted = await encrypt(
                    JSON.stringify(messagePayload),
                    currentRoom,
                )
                !wsRef.current?.CONNECTING &&
                    wsRef.current?.send(
                        JSON.stringify({
                            msg: encrypted,
                        }),
                    )
                setSendMessage('')
                setQuoteMessage(null)
                setAttachments([])
            } finally {
                setIsSending(false)
            }
        }
    }

    const handleOpenChange = (isOpen: boolean) => {
        setOpen(isOpen);
        if (!isOpen) setSelectedFile(null);
    };
    const handleUpload = async () => {
        if (selectedFile === null) return;

        try {
            const data = await upload(selectedFile);
            setAttachments((prev) => [...prev, data])

            setOpen(false);
        } catch {
            // 忽略
        } finally {
            setSelectedFile(null);
            setOpen(false);
        }
    };

    return (
        <div className="flex-1 flex flex-col h-full">
            <ScrollArea className="flex-1 min-h-0 p-4">
                {messages.map((msg) => (
                    <MessageBuddle
                        key={msg.id}
                        message={{
                            id: msg.id,
                            user: msg.name,
                            msg: msg.recalled ? '消息已撤回' : msg.content,
                            time: formatTime(msg.time),
                            quote: msg.quote,
                            recalled: msg.recalled,
                            attachments: msg.attachments,
                        }}
                        isCurrentUser={msg.name === currentUsername}
                        setQuoteMessage={setQuoteMessage}
                        recallMessage={recallMessage}
                    />
                ))}
            </ScrollArea>
            <div className="p-3 flex flex-col bg-white border-t shrink-0 max-h-45 overflow-y-auto">
                <div className="flex items-center mb-2 gap-2">
                    {attachments.map((file, idx) => (
                        <FileDisplay
                            key={file.link || file.name || idx}
                            fileData={file}
                            compact
                            deleteable
                            onDelete={(file) => {
                                setAttachments((prev) => prev.filter((f) => f !== file))
                            }}
                        />
                    ))}
                </div>
                {quoteMessage && (
                    <div className="relative text-xs p-2 mb-2 rounded border-l-4 bg-slate-50 border-slate-400 text-slate-800">
                        <p className="font-bold mb-0.5">@{quoteMessage.name}</p>
                        <div className="prose prose-sm max-w-none max-h-24 overflow-y-auto prose-p:my-0 prose-headings:my-1 prose-ul:my-0 prose-ol:my-0 prose-li:my-0 prose-pre:my-1">
                            {quoteMessage.content}
                        </div>
                        <Button
                            size="icon-xs"
                            className="absolute top-1 right-1"
                            onClick={() => {
                                setQuoteMessage(null)
                            }}
                        >
                            <XIcon />
                        </Button>
                    </div>
                )}

                <div className="flex gap-2 items-center shrink-0">
                    <Dialog open={open} onOpenChange={handleOpenChange}>
                        <DialogTrigger asChild>
                            <Button
                                size="icon-sm"
                                disabled={isSending || isUploading}
                            >
                                <FileUpIcon />
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>分享文件</DialogTitle>
                            </DialogHeader>
                            <UploadFile
                                setSelectedFile={setSelectedFile}
                                disabled={isUploading}
                            />
                            {isUploading && (
                                <div className="flex items-center gap-2 mt-2">
                                    <Progress
                                        value={uploadProgress}
                                        className="flex-1 h-2"
                                    />
                                    <span className="text-sm font-medium">
                                        {uploadProgress}%
                                    </span>
                                </div>
                            )}
                            <DialogFooter className="mt-4">
                                <DialogClose asChild>
                                    <Button
                                        variant="secondary"
                                        className="cursor-pointer"
                                        disabled={isUploading}
                                    >
                                        取消
                                    </Button>
                                </DialogClose>
                                <Button
                                    disabled={
                                        selectedFile === null || isUploading
                                    }
                                    onClick={handleUpload}
                                    className="cursor-pointer"
                                >
                                    {isUploading ? '上传中' : '分享'}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                    <Input
                        placeholder="请输入文本"
                        className="flex-1"
                        value={sendMessage}
                        onChange={(e) => setSendMessage(e.target.value)}
                        onKeyDown={async (e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault()
                                handleSend()
                            }
                        }}
                        disabled={isSending}
                    />
                    <Button
                        size={'icon-sm'}
                        onClick={handleSend}
                        disabled={isSending || (sendMessage.trim().length === 0 && attachments.length === 0)}
                    >
                        <SendIcon className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </div>
    )
}

export default App
