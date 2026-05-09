import { PlusIcon } from "lucide-react"
import { Button } from "./ui/button"
import { ScrollArea } from "./ui/scroll-area"
import { useState } from "react"
import { Input } from "./ui/input"
import { toast } from "sonner"

export const Sidebar = () => {
    const [showNameInput, setShowNameInput] = useState(false)
    const [pendingRoomName, setPendingRoomName] = useState("")

    const onConfirmCreateRoom = async () => {
        if (pendingRoomName.length === 0) return

        const roomId = Math.random() * 1000000
        const response = await fetch("/api/room", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ 
                name: pendingRoomName,
                room_id: roomId
            }),
        })
        if (response.ok) {
            setPendingRoomName("")
            setShowNameInput(false)
            location.search = `?room=${roomId}`
        } else {
            toast.error("创建聊天室失败")
        }
    }

    return (
        <div className="w-56 max-h-screen p-4 bg-gray-50 flex flex-col justify-between border-r">
            <div className="flex flex-col h-full overflow-hidden">
                <h4 className="scroll-m-20 text-xl font-semibold tracking-tight mb-2">选择聊天室</h4>

                <ScrollArea className="h-full p-2 border rounded-sm">

                </ScrollArea>
            </div>

            <div className="my-2" />

            <div className="flex flex-col gap-2">
                <Button
                    disabled={showNameInput}
                    size={"sm"}
                    onClick={() => setShowNameInput(true)}
                >
                    <PlusIcon />
                    创建聊天室
                </Button>
                {showNameInput && (
                    <div className="flex flex-col gap-2 p-2 border rounded bg-white">
                        <Input
                            value={pendingRoomName}
                            onChange={(e) => setPendingRoomName(e.target.value)}
                            placeholder="请输入房间名称"
                            autoFocus
                        />
                        <div className="flex gap-1">
                            <Button
                                size="sm"
                                className="flex-1"
                                onClick={() => void onConfirmCreateRoom()}
                                disabled={pendingRoomName.length === 0}
                            >
                                确认
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setShowNameInput(false)}>
                                取消
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}