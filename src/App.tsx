import { Avatar, Button, Card, Input, Layout, List, Toast, Typography } from "@douyinfe/semi-ui"
import { connect, type IttySocket } from 'itty-sockets'
import { useEffect, useState } from "react"

const { Sider, Content } = Layout
function App() {
  const [messages, setMessages] = useState<any[]>([])
  const [input, setInput] = useState('')
  const [channel, setChannel] = useState<IttySocket | null>(null)
  const [username, setUsername] = useState<string | undefined>('chenify')
  useEffect(() => {
    // setUsername(prompt("请输入用户名") || undefined)
    const channel = connect('easy-chat-v2', {
      as: 'chenify',
      
    })
    channel.on('message', (message) => {
      console.log('Received message:', message)
      setMessages((prev) => [...prev, JSON.parse(message.message)])
    })
    setChannel(channel)
  }, [])
  const handleSend = async () => {
        if (!input.trim()) {
            Toast.info("不能发送空消息");
            return;
        }
        const payload = JSON.stringify({ username, msg: input.trim(), time: Date.now() / 1000 });
        try {
            channel?.send(payload);
            setInput("");
            Toast.success("发送成功");
        } catch (e) {
            Toast.error("发送失败");
        }
    };

  return (
    <Layout style={{ height: "100vh" }}>
            <Sider style={{ padding: 16, background: "#f5f7fa" }}>
                <Typography.Title heading={5}>选择聊天室</Typography.Title>
            </Sider>
            <Layout>
                <Content style={{ padding: 16, overflow: "auto" }}>
                    <List
                        dataSource={messages}
                        renderItem={(item) => {
                          console.log(item)
                          return (
                            <List.Item>
                                <Card.Meta
                                    avatar={<Avatar>{item.username ? item.username[0] : "?"}</Avatar>}
                                    title={`${item.username}  ${new Date(item.time * 1000).toLocaleString()}`}
                                    description={<div style={{ whiteSpace: "pre-wrap" }}>{item.msg}</div>}
                                />
                            </List.Item>
                        )
                        }}
                    />
                </Content>
                <div style={{ padding: 12, display: "flex", gap: 8, alignItems: "center", background: "#fff" }}>
                    <Input value={input} onChange={(v) => setInput(v)} placeholder="请输入文本" onEnterPress={handleSend} style={{ flex: 1 }} />
                    <Button type="primary" onClick={handleSend} disabled={!input.trim() || !channel}>发送</Button>
                </div>
            </Layout>
        </Layout>
  )
}

export default App
