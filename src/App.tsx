import React from "react"

function App() {
    const wsRef = React.useRef<WebSocket | null>(null)
    const [username, setUsername] = React.useState("")
    const [messages, setMessages] = React.useState<any[]>([])
    React.useEffect(() => {
        const ws = new WebSocket("wss://ws.asilu.com:8090/")
        wsRef.current = ws
        ws.onopen = () => {
            ws.send(JSON.stringify({ name: 'chenify' }))
        }
        ws.onmessage = (event) => {
            // setMessages((prev) => prev + event.data + "\n")
            const data = JSON.parse(event.data)
            if (data.msg) {
                setMessages((prev) => [...prev, data.msg])
            }
        }
        return () => {
            ws.close()
        }
    }, [])

    return <div>
        <h1>Easy Chat</h1>
        {messages.map((msg, index) => <p key={index}>{msg.content}</p>)}
    </div>
}

export default App
