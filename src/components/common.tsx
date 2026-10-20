// Peças de UI compartilhadas pelos visualizadores.
import { Component, type ErrorInfo, type ReactNode } from "react";

import { openWithSystem } from "../app/actions";
import { useApp } from "../app/store";
import { ExternalIcon } from "./icons";

export function Loading({ label = "Carregando…" }: { label?: string }) {
  return (
    <div className="center-message">
      <div className="spinner" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorView({ title, message, path }: { title?: string; message: string; path?: string }) {
  return (
    <div className="center-message error-view">
      <h2>{title ?? "Não foi possível abrir o arquivo"}</h2>
      <p>{message}</p>
      {path && (
        <button className="secondary-button" onClick={() => void openWithSystem(path)}>
          <ExternalIcon size={15} /> Abrir no app padrão do Windows
        </button>
      )}
    </div>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="viewer-toolbar">{children}</div>;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? "active" : ""}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Notices() {
  const notices = useApp((s) => s.notices);
  const dismiss = useApp((s) => s.dismiss);
  if (notices.length === 0) return null;
  return (
    <div className="notices" role="status">
      {notices.map((n) => (
        <div key={n.id} className={`notice ${n.kind}`} onClick={() => dismiss(n.id)}>
          {n.text}
        </div>
      ))}
    </div>
  );
}

/** Erros de renderização de um visualizador não derrubam o app inteiro. */
export class ErrorBoundary extends Component<{ path: string; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Falha no visualizador", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return <ErrorView message={this.state.error.message} path={this.props.path} />;
    }
    return this.props.children;
  }
}
