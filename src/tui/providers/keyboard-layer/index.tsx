import React, { createContext, useContext, useCallback, useState, type ReactNode } from 'react';

type KeyboardResponder = (key: string) => boolean;

type KeyboardLayerCtx = {
  push: (id: string, responder?: KeyboardResponder) => void;
  pop: (id: string) => void;
  isTopLayer: (id: string) => boolean;
  setResponder: (id: string, responder: KeyboardResponder) => void;
};

const KeyboardLayerContext = createContext<KeyboardLayerCtx>({
  push: () => {},
  pop: () => {},
  isTopLayer: () => true,
  setResponder: () => {},
});

type Layer = {
  id: string;
  responder?: KeyboardResponder;
};

export function KeyboardLayerProvider({ children }: { children: ReactNode }) {
  const [layers, setLayers] = useState<Layer[]>([]);

  const push = useCallback((id: string, responder?: KeyboardResponder) => {
    setLayers((prev) => [...prev, { id, responder }]);
  }, []);

  const pop = useCallback((id: string) => {
    setLayers((prev) => prev.filter((l) => l.id !== id));
  }, []);

  const isTopLayer = useCallback(
    (id: string) => {
      if (layers.length === 0) return true;
      return layers[layers.length - 1]?.id === id;
    },
    [layers]
  );

  const setResponder = useCallback((id: string, responder: KeyboardResponder) => {
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, responder } : l)));
  }, []);

  return (
    <KeyboardLayerContext.Provider value={{ push, pop, isTopLayer, setResponder }}>
      {children}
    </KeyboardLayerContext.Provider>
  );
}

export function useKeyboardLayer() {
  return useContext(KeyboardLayerContext);
}
