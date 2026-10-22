import { useEffect, useRef, useState } from "react";

import { closeActiveTab, newFile, openFileDialog, revealInExplorer, saveActiveTab, saveActiveTabAs } from "../app/actions";
import { diffHistory, diffUnsaved, diffWithFile } from "../app/diffActions";
import { useActiveTab, useApp, type ThemeMode } from "../app/store";
import { CheckIcon, FileNewIcon, FolderOpenIcon, GalaxyLogo, MonitorIcon, MoonIcon, SunIcon } from "./icons";
import { TabSearch } from "./TabSearch";

interface MenuItem {
  label?: string;
  shortcut?: string;
  title?: string;
  disabled?: boolean;
  checked?: boolean;
  separator?: boolean;
  heading?: boolean;
  onClick?: () => void;
}

interface MenuDef {
  label: string;
  items: MenuItem[];
}

const THEMES: { mode: ThemeMode; label: string; icon: typeof SunIcon }[] = [
  { mode: "system", label: "Seguir o sistema", icon: MonitorIcon },
  { mode: "light", label: "Claro", icon: SunIcon },
  { mode: "dark", label: "Escuro", icon: MoonIcon },
];

const fileName = (path: string) => path.slice(Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/")) + 1);

export function MenuBar() {
  const tab = useActiveTab();
  const recent = useApp((s) => s.recent);
  const theme = useApp((s) => s.theme);
  const setTheme = useApp((s) => s.setTheme);
  const openPaths = useApp((s) => s.openPaths);
  const [openMenu, setOpenMenu] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // Fecha o menu ao clicar fora ou apertar Esc.
  useEffect(() => {
    if (openMenu === null) return;
    const onDown = (e: MouseEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setOpenMenu(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenMenu(null);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [openMenu]);

  const editable = !!tab && tab.viewer !== "diff";
  const hasFile = !!tab?.info.path;

  const menus: MenuDef[] = [
    {
      label: "Arquivo",
      items: [
        { label: "Novo arquivo de texto", shortcut: "Ctrl+N", onClick: () => newFile("txt") },
        { label: "Novo markdown", onClick: () => newFile("md") },
        { label: "Novo JSON", onClick: () => newFile("json") },
        { separator: true },
        { label: "Abrir…", shortcut: "Ctrl+O", onClick: () => void openFileDialog() },
        ...(recent.length
          ? [
              { heading: true, label: "Recentes" },
              ...recent.slice(0, 6).map((path) => ({
                label: fileName(path),
                title: path,
                onClick: () => void openPaths([path]),
              })),
            ]
          : []),
        { separator: true },
        { label: "Salvar", shortcut: "Ctrl+S", disabled: !editable, onClick: () => void saveActiveTab() },
        { label: "Salvar como…", shortcut: "Ctrl+Shift+S", disabled: !editable, onClick: () => void saveActiveTabAs() },
        { separator: true },
        { label: "Mostrar na pasta", disabled: !hasFile, onClick: () => tab && void revealInExplorer(tab.info.path) },
        { label: "Fechar aba", shortcut: "Ctrl+W", disabled: !tab, onClick: () => void closeActiveTab() },
      ],
    },
    {
      label: "Exibir",
      items: [
        { heading: true, label: "Tema" },
        ...THEMES.map(({ mode, label }) => ({ label, checked: theme === mode, onClick: () => void setTheme(mode) })),
        { separator: true },
        { label: "Próxima aba", shortcut: "Ctrl+Tab", disabled: !tab, onClick: () => useApp.getState().cycle(1) },
        { label: "Aba anterior", shortcut: "Ctrl+Shift+Tab", disabled: !tab, onClick: () => useApp.getState().cycle(-1) },
      ],
    },
    {
      label: "Comparar",
      items: [
        { label: "Alterações não salvas", shortcut: "Ctrl+Alt+D", disabled: !editable, onClick: diffUnsaved },
        { label: "Histórico de versões", disabled: !editable, onClick: () => void diffHistory() },
        { label: "Com outro arquivo…", disabled: !editable, onClick: () => void diffWithFile() },
      ],
    },
  ];

  const current = THEMES.find((t) => t.mode === theme)!;
  const next = THEMES[(THEMES.indexOf(current) + 1) % THEMES.length];
  const ThemeIcon = current.icon;

  return (
    <header className="menubar" ref={barRef}>
      <div className="menubar-brand" title="Galaxy">
        <GalaxyLogo size={22} />
      </div>
      <nav className="menus">
        {menus.map((menu, index) => (
          <div key={menu.label} className="menu">
            <button
              className={`menu-button${openMenu === index ? " open" : ""}`}
              onClick={() => setOpenMenu(openMenu === index ? null : index)}
              // Com um menu aberto, passar o mouse em outro troca de menu (como nos programas do Windows).
              onMouseEnter={() => openMenu !== null && setOpenMenu(index)}
            >
              {menu.label}
            </button>
            {openMenu === index && (
              <div className="menu-list" role="menu">
                {menu.items.map((item, i) =>
                  item.separator ? (
                    <div key={i} className="menu-separator" />
                  ) : item.heading ? (
                    <div key={i} className="menu-heading">
                      {item.label}
                    </div>
                  ) : (
                    <button
                      key={i}
                      role="menuitem"
                      className="menu-item"
                      title={item.title}
                      disabled={item.disabled}
                      onClick={() => {
                        setOpenMenu(null);
                        item.onClick?.();
                      }}
                    >
                      <span className="menu-check">{item.checked && <CheckIcon size={14} />}</span>
                      <span className="menu-label">{item.label}</span>
                      {item.shortcut && <span className="menu-shortcut">{item.shortcut}</span>}
                    </button>
                  ),
                )}
              </div>
            )}
          </div>
        ))}
      </nav>

      <div className="menubar-actions">
        <button className="icon-button" title="Novo arquivo (Ctrl+N)" onClick={() => newFile("txt")}>
          <FileNewIcon />
        </button>
        <button className="icon-button" title="Abrir arquivo (Ctrl+O)" onClick={() => void openFileDialog()}>
          <FolderOpenIcon />
        </button>
      </div>

      <TabSearch />

      <button
        className="icon-button"
        title={`Tema: ${current.label}. Clique para: ${next.label}`}
        onClick={() => void setTheme(next.mode)}
      >
        <ThemeIcon />
      </button>
    </header>
  );
}
