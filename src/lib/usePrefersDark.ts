import { useEffect, useState } from "react";

import { useApp } from "../app/store";

const query = () => window.matchMedia("(prefers-color-scheme: dark)");

/** Acompanha o tema do Windows. */
function useSystemDark(): boolean {
  const [dark, setDark] = useState(() => query().matches);
  useEffect(() => {
    const mq = query();
    const onChange = () => setDark(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return dark;
}

/** O tema está escuro? Segue a escolha do usuário; no modo "sistema", o Windows. */
export function usePrefersDark(): boolean {
  const theme = useApp((s) => s.theme);
  const system = useSystemDark();
  return theme === "system" ? system : theme === "dark";
}
