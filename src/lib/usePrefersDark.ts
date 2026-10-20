import { useEffect, useState } from "react";

const query = () => window.matchMedia("(prefers-color-scheme: dark)");

/** Acompanha o tema claro/escuro do Windows. */
export function usePrefersDark(): boolean {
  const [dark, setDark] = useState(() => query().matches);
  useEffect(() => {
    const mq = query();
    const onChange = () => setDark(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return dark;
}
