// Chat drawer + history (issue #3, plan T4/D6). Fragment rules apply:
// no <style>/<script>/document shell tags, no 100vh; host CSS vars only.
// Single-turn copy (D7): #687 multi-turn session_id not shipped — each
// message is an independent orchestrator job, stated in the UI.
export const chatDrawerHtml = `<div x-show="agentMgr.chat.open" x-cloak class="fixed inset-0 z-50 flex" data-chat-drawer>
  <div class="flex-1 bg-black opacity-50" @click="agentMgrCloseChat()"></div>
  <div class="w-96 bg-white p-4 flex flex-col" role="dialog" aria-label="Chat">
    <div class="flex items-center justify-between mb-2">
      <h3 class="text-base font-semibold">
        Chat — <span x-text="agentMgr.chat.agentName"></span>
      </h3>
      <button type="button" @click="agentMgrCloseChat()" data-chat-close>Close</button>
    </div>

    <div class="flex items-center gap-2 mb-2 text-sm">
      <button type="button" class="px-2 py-1 rounded border" @click="agentMgrNewConversation()" data-chat-new>New conversation</button>
      <span class="text-xs text-gray-500" data-chat-singleturn-note>Each message is an independent turn — the agent carries no memory across messages.</span>
    </div>

    <div class="mb-2 text-sm" data-chat-history>
      <p x-show="agentMgr.chat.loadingSessions" class="text-gray-500">Loading history…</p>
      <p x-show="!agentMgr.chat.loadingSessions && agentMgr.chat.sessions.length === 0" class="text-gray-500" data-chat-history-empty>No past conversations</p>
      <ul x-show="!agentMgr.chat.loadingSessions && agentMgr.chat.sessions.length > 0" class="max-h-24 overflow-y-auto border rounded">
        <template x-for="s in agentMgr.chat.sessions" :key="s.id">
          <li class="border-b last:border-b-0">
            <button type="button" class="w-full text-left px-2 py-1 hover:bg-gray-50" @click="agentMgrOpenChatSession(s.id)" data-chat-history-item>
              <span class="block truncate" x-text="s.preview || '(empty)'"></span>
              <span class="block text-xs text-gray-500" x-text="new Date(s.created_at).toLocaleString()"></span>
            </button>
          </li>
        </template>
      </ul>
    </div>

    <div class="flex-1 min-h-32 max-h-64 overflow-y-auto border rounded p-2 mb-2 text-sm" data-chat-messages>
      <p x-show="agentMgr.chat.messages.length === 0" class="text-gray-500" data-chat-empty>No messages yet</p>
      <template x-for="(m, i) in agentMgr.chat.messages" :key="i">
        <div class="mb-2" :data-chat-role="m.role">
          <span class="font-semibold" x-text="m.role === 'user' ? 'You' : 'Agent'"></span>
          <p class="whitespace-pre-wrap break-words" x-text="m.content"></p>
        </div>
      </template>
    </div>

    <p x-show="agentMgr.chat.status === 'sending' || agentMgr.chat.status === 'running'" class="text-sm text-blue-600 mb-2" data-chat-running>RUNNING…</p>
    <p x-show="agentMgr.chat.error" class="text-sm text-red-600 mb-2 whitespace-pre-wrap" x-text="agentMgr.chat.error" data-chat-error></p>

    <div class="flex gap-2">
      <input class="flex-1 border rounded px-2 py-1 text-sm" type="text" x-model="agentMgr.chat.input" @keydown.enter="agentMgrSendChat()" placeholder="Message…" data-chat-input />
      <button type="button" class="px-3 py-1 rounded bg-blue-600 text-white text-sm disabled:opacity-50" :disabled="agentMgr.chat.status === 'sending' || agentMgr.chat.status === 'running' || !agentMgr.chat.input.trim()" @click="agentMgrSendChat()" data-chat-send>Send</button>
    </div>
  </div>
</div>
`;
