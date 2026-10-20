import { useAppEvents } from "./app/useAppEvents";
import { useApp } from "./app/store";
import { Notices } from "./components/common";
import { FolderOpenIcon } from "./components/icons";
import { StatusBar } from "./components/StatusBar";
import { TabBar } from "./components/TabBar";
import { WelcomeScreen } from "./components/WelcomeScreen";
import { ViewerHost } from "./viewers/ViewerHost";

export default function App() {
  const tabs = useApp((s) => s.tabs);
  const activeId = useApp((s) => s.activeId);
  const { dragging } = useAppEvents();

  return (
    <div className="app">
      <TabBar />
      <main className="content">
        {tabs.length === 0 && <WelcomeScreen />}
        {/* Todas as abas ficam montadas para preservar rolagem, zoom e posição da mídia. */}
        {tabs.map((tab) => (
          <section key={tab.id} className="tab-panel" hidden={tab.id !== activeId}>
            <ViewerHost tab={tab} active={tab.id === activeId} />
          </section>
        ))}
      </main>
      <StatusBar />
      <Notices />
      {dragging && (
        <div className="drop-overlay">
          <FolderOpenIcon size={48} />
          <span>Solte para abrir</span>
        </div>
      )}
    </div>
  );
}
