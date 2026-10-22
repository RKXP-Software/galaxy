import { useEffect, useRef, useState } from "react";

import { newFile } from "../app/actions";
import { useApp } from "../app/store";
import { ChevronDownIcon, CloseIcon, PlusIcon, ViewerIcon } from "./icons";

export function TabBar() {
  const tabs = useApp((s) => s.tabs);
  const activeId = useApp((s) => s.activeId);
  const activate = useApp((s) => s.activate);
  const closeTab = useApp((s) => s.closeTab);
  const listRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Fecha o menu ao clicar fora ou apertar Esc.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // Mantém a aba ativa visível rolando só a barra de abas. scrollIntoView
  // rolaria também a janela inteira e deslocaria o layout.
  useEffect(() => {
    const list = listRef.current;
    const tab = list?.querySelector<HTMLElement>('.tab.active');
    if (!list || !tab) return;
    if (tab.offsetLeft < list.scrollLeft) list.scrollLeft = tab.offsetLeft;
    else if (tab.offsetLeft + tab.offsetWidth > list.scrollLeft + list.clientWidth)
      list.scrollLeft = tab.offsetLeft + tab.offsetWidth - list.clientWidth;
  }, [activeId]);

  return (
    <div className="tabbar">
      <div
        className="tabs"
        ref={listRef}
        role="tablist"
        onWheel={(e) => {
          if (listRef.current && e.deltaY !== 0) listRef.current.scrollLeft += e.deltaY;
        }}
      >
        {tabs.map((tab) => (
          <div
            key={tab.id}
            role="tab"
            aria-selected={tab.id === activeId}
            className={`tab${tab.id === activeId ? " active" : ""}`}
            title={tab.info.path}
            onMouseDown={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                void closeTab(tab.id);
              } else if (e.button === 0) {
                activate(tab.id);
              }
            }}
          >
            <ViewerIcon viewer={tab.viewer} size={15} className="tab-icon" />
            <span className="tab-name">{tab.info.name}</span>
            {tab.dirty && <span className="tab-dirty" title="Alterações não salvas" />}
            <button
              className="tab-close"
              title="Fechar (Ctrl+W)"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => void closeTab(tab.id)}
            >
              <CloseIcon size={13} />
            </button>
          </div>
        ))}
      </div>
      <button className="icon-button tab-new" title="Novo arquivo (Ctrl+N)" onClick={() => newFile("txt")}>
        <PlusIcon />
      </button>
      {tabs.length > 1 && (
        <div className="tab-menu" ref={menuRef}>
          <button
            className={`icon-button${menuOpen ? " active" : ""}`}
            title={`Todas as abas (${tabs.length})`}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <ChevronDownIcon />
          </button>
          {menuOpen && (
            <div className="tab-menu-list" role="menu">
              {tabs.map((tab) => (
                <div key={tab.id} className={`tab-menu-item${tab.id === activeId ? " active" : ""}`} role="menuitem">
                  <button
                    className="tab-menu-open"
                    title={tab.info.path}
                    onClick={() => {
                      activate(tab.id);
                      setMenuOpen(false);
                    }}
                  >
                    <ViewerIcon viewer={tab.viewer} size={15} />
                    <span className="tab-name">{tab.info.name}</span>
                    {tab.dirty && <span className="tab-dirty" />}
                  </button>
                  <button className="icon-button small" title="Fechar" onClick={() => void closeTab(tab.id)}>
                    <CloseIcon size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
