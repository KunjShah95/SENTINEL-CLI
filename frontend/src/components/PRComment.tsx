
import { MessageSquare, ThumbsUp, ShieldAlert, Check } from 'lucide-react';

export function PRComment() {
    return (
        <div className="rounded-xl border border-gray-800 bg-[#0d1117] shadow-xl overflow-hidden font-sans w-full max-w-lg mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
                        <span className="font-display font-bold text-emerald-500 text-xs">AI</span>
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-sm">Sentinel Bot</span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-800 text-gray-400 border border-gray-700">bot</span>
                        </div>
                        <div className="text-xs text-gray-500">Just now</div>
                    </div>
                </div>
                <div className="flex gap-1">
                    <div className="p-1.5 rounded hover:bg-white/5 text-gray-500"><MessageSquare className="w-4 h-4" /></div>
                </div>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4">
                {/* Comment Text */}
                <div className="text-sm text-gray-300 leading-relaxed">
                    <p className="mb-2"><span className="text-rose-400 font-bold">High Severity Issue Detected</span></p>
                    <p>
                        It looks like this endpoint is vulnerable to SQL Injection because the <code className="bg-gray-800 px-1 py-0.5 rounded text-gray-200">userId</code> parameter
                        is concatenated directly into the query string.
                    </p>
                </div>

                {/* Code Snippet */}
                <div className="rounded-lg border border-gray-800 bg-[#0a0a0b] overflow-hidden">
                    <div className="flex">
                        <div className="w-10 bg-gray-900 border-r border-gray-800 flex flex-col items-end text-[10px] text-gray-500 py-2 px-2 font-mono gap-1 select-none">
                            <span>42</span>
                            <span>43</span>
                        </div>
                        <div className="flex-1 p-2 overflow-x-auto">
                            <div className="font-mono text-xs whitespace-pre">
                                <div className="text-gray-500 line-through decoration-rose-500/50 decoration-2">
                                    <span className="text-rose-400">- const query = "SELECT * FROM users WHERE id = " + userId;</span>
                                </div>
                                <div className="text-emerald-400 bg-emerald-500/10 -mx-2 px-2">
                                    <span>+ const query = "SELECT * FROM users WHERE id = $1";</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Suggested Fix Action */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-800 border border-gray-700 text-gray-400">
                            <ThumbsUp className="w-3 h-3" />
                        </div>
                        <span className="text-xs text-gray-500">2</span>
                    </div>
                    <button
                        onClick={() => alert("This is a demo! In the real app, this would open a PR with the fix.")}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors shadow-lg shadow-emerald-500/10 cursor-pointer active:scale-95 relative z-10 pointer-events-auto"
                    >
                        <Check className="w-3 h-3" />
                        Commit Suggestion
                    </button>
                </div>
            </div>
        </div>
    );
}
