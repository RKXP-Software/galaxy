import { createContext, memo, useContext, useEffect, useState } from "react";

/** Comando "expandir/recolher tudo": muda `version` a cada clique. */
export interface TreeCommand {
  version: number;
  open: boolean;
}

const CommandContext = createContext<TreeCommand>({ version: 0, open: false });

const PAGE = 200;
const MAX_STRING = 400;
/** "Expandir tudo" para nesta profundidade para não travar com JSON enormes. */
const MAX_EXPAND_DEPTH = 6;

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function Primitive({ value }: { value: Json }) {
  if (value === null) return <span className="json-null">null</span>;
  if (typeof value === "string") {
    const shown = value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
    return (
      <span className="json-string" title={value.length > MAX_STRING ? value : undefined}>
        {JSON.stringify(shown)}
      </span>
    );
  }
  if (typeof value === "number") return <span className="json-number">{String(value)}</span>;
  return <span className="json-boolean">{String(value)}</span>;
}

const JsonNode = memo(function JsonNode({ name, value, depth }: { name: string | number | null; value: Json; depth: number }) {
  const command = useContext(CommandContext);
  const isContainer = value !== null && typeof value === "object";
  const [open, setOpen] = useState(depth < 1);
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    if (command.version > 0) setOpen(command.open && depth < MAX_EXPAND_DEPTH);
  }, [command, depth]);

  const label =
    name === null ? null : (
      <>
        <span className={typeof name === "number" ? "json-index" : "json-key"}>{typeof name === "number" ? name : `"${name}"`}</span>
        <span className="json-colon">: </span>
      </>
    );

  if (!isContainer) {
    return (
      <div className="json-row" style={{ paddingLeft: depth * 16 + 18 }}>
        {label}
        <Primitive value={value} />
      </div>
    );
  }

  const isArray = Array.isArray(value);
  const entries: [string | number, Json][] = isArray ? value.map((v, i) => [i, v]) : Object.entries(value);
  const summary = isArray ? `[${entries.length}]` : `{${entries.length}}`;

  return (
    <>
      <div className="json-row clickable" style={{ paddingLeft: depth * 16 }} onClick={() => setOpen(!open)}>
        <span className={`json-caret${open ? " open" : ""}`}>▸</span>
        {label}
        <span className="json-summary">{summary}</span>
      </div>
      {open &&
        entries.slice(0, limit).map(([key, child]) => <JsonNode key={key} name={key} value={child} depth={depth + 1} />)}
      {open && entries.length > limit && (
        <div className="json-row" style={{ paddingLeft: (depth + 1) * 16 + 18 }}>
          <button className="link-button" onClick={() => setLimit(limit + PAGE)}>
            Mostrar mais {Math.min(PAGE, entries.length - limit)} de {entries.length - limit} restantes
          </button>
        </div>
      )}
    </>
  );
});

export function JsonTree({ value, command }: { value: unknown; command: TreeCommand }) {
  return (
    <CommandContext.Provider value={command}>
      <div className="json-tree selectable">
        <JsonNode name={null} value={value as Json} depth={0} />
      </div>
    </CommandContext.Provider>
  );
}
