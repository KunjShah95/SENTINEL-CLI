const vscode = acquireVsCodeApi();

const state = {
    messages: [],
    agents: [],
    currentAgent: 'adaptive'
};

const agentContainer = document.getElementById('agent-selector');
const messagesContainer = document.getElementById('messages');
const input = document.getElementById('input');
const sendButton = document.getElementById('send');
const attachButton = document.getElementById('attach');

function escapeHtml(text) {
    return (text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function findMessage(messageId) {
    return state.messages.find(m => m.id === messageId);
}

function renderAgentSelector() {
    const options = state.agents
        .map(agent => {
            const selected = agent.id === state.currentAgent ? 'selected' : '';
            return `<option value="${agent.id}" ${selected}>${escapeHtml(agent.name)}</option>`;
        })
        .join('');

    agentContainer.innerHTML = `
        <label for="agentSelect">Agent</label>
        <select id="agentSelect">${options}</select>
        <button id="clearBtn" class="secondary">Clear</button>
        <button id="exportBtn" class="secondary">Export</button>
    `;

    const select = document.getElementById('agentSelect');
    select?.addEventListener('change', event => {
        const value = event.target && event.target.value ? event.target.value : 'adaptive';
        state.currentAgent = value;
        vscode.postMessage({ type: 'selectAgent', agent: value });
    });

    document.getElementById('clearBtn')?.addEventListener('click', () => {
        vscode.postMessage({ type: 'clearHistory' });
    });

    document.getElementById('exportBtn')?.addEventListener('click', () => {
        vscode.postMessage({ type: 'exportChat' });
    });
}

function renderActions(message) {
    const actions = message.actions || [];
    if (actions.length === 0) {
        return '';
    }

    return `
        <div class="actions">
            ${actions.map((action, index) => {
                const target = action.file || action.content || '';
                const status =
                    action.approved === true ? 'approved' : action.approved === false ? 'rejected' : 'pending';
                const controls = action.approved === undefined
                    ? `<div class="action-controls">
                        <button data-action="approve" data-mid="${message.id}" data-index="${index}">Approve</button>
                        <button class="secondary" data-action="reject" data-mid="${message.id}" data-index="${index}">Reject</button>
                       </div>`
                    : '';

                return `
                    <div class="action-item">
                        <div><strong>${escapeHtml(action.type)}</strong> - ${escapeHtml(target)}</div>
                        <div class="meta">Status: ${status}</div>
                        ${controls}
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function renderMessages() {
    messagesContainer.innerHTML = state.messages.map(message => {
        const agentLabel = message.agent ? ` [${escapeHtml(message.agent)}]` : '';
        const thinking = message.thinking ? `<div class="thinking">${escapeHtml(message.thinking)}</div>` : '';
        return `
            <div class="message ${message.role}">
                <div class="meta">${escapeHtml(message.role)}${agentLabel}</div>
                <div class="content">${escapeHtml(message.content)}</div>
                ${thinking}
                ${renderActions(message)}
            </div>
        `;
    }).join('');

    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function upsertMessage(message) {
    const existing = findMessage(message.id);
    if (existing) {
        Object.assign(existing, message);
    } else {
        state.messages.push(message);
    }
    renderMessages();
}

function sendMessage() {
    const content = input.value.trim();
    if (!content) return;
    vscode.postMessage({ type: 'sendMessage', message: content, files: [] });
    input.value = '';
}

sendButton?.addEventListener('click', sendMessage);
attachButton?.addEventListener('click', () => {
    // Placeholder for future file attach support.
    input.focus();
});

input?.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
});

messagesContainer.addEventListener('click', event => {
    const target = event.target;
    if (!target || !target.dataset) return;

    const action = target.dataset.action;
    const messageId = target.dataset.mid;
    const index = Number(target.dataset.index);
    if (!messageId || Number.isNaN(index)) return;

    if (action === 'approve') {
        vscode.postMessage({ type: 'approveAction', messageId, actionIndex: index });
    }
    if (action === 'reject') {
        vscode.postMessage({ type: 'rejectAction', messageId, actionIndex: index });
    }
});

window.addEventListener('message', event => {
    const data = event.data;

    switch (data.type) {
        case 'init':
            state.messages = data.messages || [];
            state.currentAgent = data.agent || 'adaptive';
            state.agents = data.agents || [];
            renderAgentSelector();
            renderMessages();
            break;

        case 'agentSelected':
            state.currentAgent = data.agent;
            renderAgentSelector();
            break;

        case 'message':
            upsertMessage(data.message);
            break;

        case 'streamToken': {
            const message = findMessage(data.messageId);
            if (message) {
                message.content = (message.content || '') + (data.token || '');
                renderMessages();
            }
            break;
        }

        case 'thinking': {
            const message = findMessage(data.messageId);
            if (message) {
                message.thinking = data.thinking || '';
                renderMessages();
            }
            break;
        }

        case 'action': {
            const message = findMessage(data.messageId);
            if (message) {
                message.actions = message.actions || [];
                message.actions.push(data.action);
                renderMessages();
            }
            break;
        }

        case 'complete': {
            const message = findMessage(data.messageId);
            if (message) {
                message.status = 'complete';
                renderMessages();
            }
            break;
        }

        case 'error': {
            const message = findMessage(data.messageId);
            if (message) {
                message.status = 'error';
                renderMessages();
            }
            break;
        }

        case 'cleared':
            state.messages = [];
            renderMessages();
            break;
    }
});
