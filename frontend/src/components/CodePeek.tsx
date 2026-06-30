import { useState, useEffect, useRef } from 'react';

type SymbolInfo = {
  name: string;
  definitions: Array<{ file: string; line: number; type: string; context: string }>;
  usages: Array<{ file: string; line: number; type: string; context: string }>;
  references: Array<{ file: string; line: number; type: string; context: string }>;
  totalOccurrences: number;
};

type Props = {
  symbol?: string | null;
  symbols?: SymbolInfo[];
  onSymbolSelect?: (symbol: string) => void;
};

export function CodePeek({ symbol, symbols = [], onSymbolSelect }: Props) {
  const [selectedSymbol, setSelectedSymbol] = useState<SymbolInfo | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (symbol) {
      setSearchQuery(symbol);
      const found = symbols.find(s => s.name === symbol);
      setSelectedSymbol(found || null);
    }
  }, [symbol, symbols]);

  const filteredSymbols = symbols.filter(s =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelect = (sym: SymbolInfo) => {
    setSelectedSymbol(sym);
    onSymbolSelect?.(sym.name);
  };

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search symbols..."
          className="w-full px-2 py-1.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:border-[var(--color-primary)]"
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[var(--color-text-secondary)]">
          {filteredSymbols.length}
        </span>
      </div>

      {/* Symbol list */}
      {filteredSymbols.length > 0 && (
        <div className="max-h-32 overflow-y-auto space-y-0.5">
          {filteredSymbols.slice(0, 20).map(sym => (
            <button
              key={sym.name}
              onClick={() => handleSelect(sym)}
              className={`w-full flex items-center gap-2 px-2 py-1 text-[11px] rounded text-left hover:bg-[var(--color-surface-hover)] ${
                selectedSymbol?.name === sym.name ? 'bg-[var(--color-surface)] text-[var(--color-primary)]' : 'text-[var(--color-text-secondary)]'
              }`}
            >
              <span className="font-mono truncate flex-1">{sym.name}</span>
              <span className="text-[9px]">{sym.occurrences}x</span>
              <span className="text-[9px] text-[var(--color-text-secondary)]">{sym.types?.join(', ')}</span>
            </button>
          ))}
        </div>
      )}

      {/* Selected symbol details */}
      {selectedSymbol && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-[var(--color-primary)]">{selectedSymbol.name}</span>
            <span className="text-[10px] text-[var(--color-text-secondary)]">
              {selectedSymbol.totalOccurrences} occurrence(s)
            </span>
          </div>

          {/* Definitions */}
          {selectedSymbol.definitions?.length > 0 && (
            <div>
              <h4 className="text-[10px] font-semibold text-[var(--color-text-secondary)] uppercase mb-1">Definitions</h4>
              {selectedSymbol.definitions.map((def, i) => (
                <div key={i} className="px-2 py-1 bg-[var(--color-surface)] rounded text-[11px] mb-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[var(--color-primary)]">{def.file}:{def.line}</span>
                    <span className="text-[9px] px-1 rounded bg-[var(--color-primary)]/10 text-[var(--color-primary)]">{def.type}</span>
                  </div>
                  <p className="text-[10px] text-[var(--color-text-secondary)] font-mono mt-0.5 truncate">{def.context}</p>
                </div>
              ))}
            </div>
          )}

          {/* Usages */}
          {selectedSymbol.usages?.length > 0 && (
            <div>
              <h4 className="text-[10px] font-semibold text-[var(--color-text-secondary)] uppercase mb-1">Usages</h4>
              {selectedSymbol.usages.slice(0, 5).map((usage, i) => (
                <div key={i} className="px-2 py-1 bg-[var(--color-surface)] rounded text-[11px] mb-1">
                  <span className="font-mono text-[var(--color-text-primary)]">{usage.file}:{usage.line}</span>
                  <p className="text-[10px] text-[var(--color-text-secondary)] font-mono truncate">{usage.context}</p>
                </div>
              ))}
              {selectedSymbol.usages.length > 5 && (
                <p className="text-[10px] text-[var(--color-text-secondary)]">+{selectedSymbol.usages.length - 5} more</p>
              )}
            </div>
          )}

          {/* Cross-file references */}
          {selectedSymbol.references?.length > 0 && (
            <div>
              <h4 className="text-[10px] font-semibold text-[var(--color-text-secondary)] uppercase mb-1">
                References ({selectedSymbol.references.length})
              </h4>
              {selectedSymbol.references.slice(0, 3).map((ref, i) => (
                <div key={i} className="px-2 py-1 bg-[var(--color-surface)] rounded text-[11px] mb-1">
                  <span className="font-mono text-[var(--color-text-primary)]">{ref.file}:{ref.line}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!selectedSymbol && symbols.length === 0 && (
        <p className="text-xs text-[var(--color-text-secondary)]">
          No symbol data available. Run a review to index symbols.
        </p>
      )}
    </div>
  );
}
