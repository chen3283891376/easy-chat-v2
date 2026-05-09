import MessageArea from "./components/MessageArea";
import { Sidebar } from "./components/Sidebar";

export default function App() {
    return (
        <div className="h-screen flex">
            <Sidebar />

            <MessageArea />
        </div>
    )
}