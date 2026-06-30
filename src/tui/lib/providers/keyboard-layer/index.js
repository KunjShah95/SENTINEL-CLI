import { jsx as _jsx } from 'react/jsx-runtime';
import { createContext, useContext, useCallback, useState } from 'react';
const KeyboardLayerContext = createContext({
  push: () => { },
  pop: () => { },
  isTopLayer: () => true,
  setResponder: () => { },
});
export function KeyboardLayerProvider({ children }) {
  const [layers, setLayers] = useState([]);
  const push = useCallback((id, responder) => {
    setLayers((prev) => [...prev, { id, responder }]);
  }, []);
  const pop = useCallback((id) => {
    setLayers((prev) => prev.filter((l) => l.id !== id));
  }, []);
  const isTopLayer = useCallback((id) => {
    if (layers.length === 0)
      return true;
    return layers[layers.length - 1]?.id === id;
  }, [layers]);
  const setResponder = useCallback((id, responder) => {
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, responder } : l)));
  }, []);
  return (_jsx(KeyboardLayerContext.Provider, { value: { push, pop, isTopLayer, setResponder }, children: children }));
}
export function useKeyboardLayer() {
  return useContext(KeyboardLayerContext);
}
