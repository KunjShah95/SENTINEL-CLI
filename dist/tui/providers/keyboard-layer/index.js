import { jsx as _jsx } from "@opentui/react/jsx-runtime";
import { createContext, useContext, useState, useCallback } from "react";
const KeyboardLayerContext = createContext(null);
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
    const ctx = useContext(KeyboardLayerContext);
    if (!ctx)
        throw new Error("useKeyboardLayer must be used within KeyboardLayerProvider");
    return ctx;
}
