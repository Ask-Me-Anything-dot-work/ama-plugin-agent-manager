// Managed-agent section: table + create/edit drawer (issue #2, What to build 1).
// Fragment rules apply: no <style>/<script>/document shell tags, no 100vh.
export const managedSectionHtml = `<div class="mb-8">
  <div class="flex items-center justify-between mb-3">
    <h3 class="text-base font-semibold">Managed agents</h3>
    <button type="button" class="px-3 py-1 rounded bg-blue-600 text-white text-sm" data-agents-create @click="agentMgrOpenCreate()">Create agent</button>
  </div>
  <p x-show="agentMgr.loading" data-agents-loading>Loading…</p>
  <p class="text-red-600 text-sm" x-show="!agentMgr.loading && agentMgr.error" x-text="agentMgr.error" data-agents-error></p>
  <p x-show="!agentMgr.loading && !agentMgr.error && agentMgr.agents.length === 0" data-agents-empty>No agents yet</p>
  <table class="w-full text-sm" x-show="!agentMgr.loading && agentMgr.agents.length > 0">
    <thead>
      <tr class="text-left border-b">
        <th class="py-1 pr-2">Name</th>
        <th class="py-1 pr-2">Description</th>
        <th class="py-1 pr-2">Model</th>
        <th class="py-1 pr-2">MCP profile</th>
        <th class="py-1 pr-2">Enabled</th>
        <th class="py-1">Actions</th>
      </tr>
    </thead>
    <tbody>
      <template x-for="agent in agentMgr.agents" :key="agent.id">
        <tr class="border-b">
          <td class="py-1 pr-2">
            <span x-text="agent.name"></span>
            <span class="ml-2 px-1.5 py-0.5 rounded text-xs bg-blue-100 text-blue-800" data-managed-badge>Managed agent</span>
          </td>
          <td class="py-1 pr-2" x-text="agent.description || '—'"></td>
          <td class="py-1 pr-2" x-text="agent.model"></td>
          <td class="py-1 pr-2" x-text="agent.mcp_profile_id || '—'"></td>
          <td class="py-1 pr-2">
            <input type="checkbox" :checked="agent.enabled" @change="agentMgrToggle(agent)" data-agents-enabled-toggle />
            <span class="ml-1" x-text="agent.enabled ? 'Enabled' : 'Disabled'"></span>
          </td>
          <td class="py-1">
            <button type="button" class="text-blue-600 mr-2" @click="agentMgrOpenChat(agent)" data-agents-chat>Chat</button>
            <button type="button" class="text-blue-600 mr-2" @click="agentMgrOpenEdit(agent)" data-agents-edit>Edit</button>
            <button type="button" class="text-red-600" @click="agentMgrDelete(agent)" data-agents-delete>Delete</button>
          </td>
        </tr>
      </template>
    </tbody>
  </table>
</div>

<div x-show="agentMgr.drawerOpen" class="fixed inset-0 z-50 flex" data-agents-drawer>
  <div class="flex-1 bg-black opacity-50" @click="agentMgrCloseDrawer()"></div>
  <div class="w-96 bg-white p-4 overflow-y-auto shadow-lg">
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-base font-semibold" x-text="agentMgr.drawerMode === 'create' ? 'Create agent' : 'Edit agent'"></h3>
      <button type="button" @click="agentMgrCloseDrawer()" data-agents-drawer-close>Close</button>
    </div>
    <p class="text-red-600 text-sm mb-2" x-show="agentMgr.formError" x-text="agentMgr.formError" data-agents-form-error></p>
    <label class="block mb-2 text-sm">Name
      <input class="w-full border rounded px-2 py-1" type="text" x-model="agentMgr.form.name" data-agents-field-name />
    </label>
    <label class="block mb-2 text-sm">Description
      <input class="w-full border rounded px-2 py-1" type="text" x-model="agentMgr.form.description" data-agents-field-description />
    </label>
    <label class="block mb-2 text-sm">Instructions
      <textarea class="w-full border rounded px-2 py-1" rows="6" x-model="agentMgr.form.instructions" data-agents-field-instructions></textarea>
    </label>
    <label class="block mb-2 text-sm">Model
      <input class="w-full border rounded px-2 py-1" type="text" x-model="agentMgr.form.model" data-agents-field-model />
    </label>
    <label class="block mb-2 text-sm">MCP profile ID
      <input class="w-full border rounded px-2 py-1" type="text" x-model="agentMgr.form.mcp_profile_id" data-agents-field-mcp-profile />
    </label>
    <label class="block mb-3 text-sm">
      <input type="checkbox" x-model="agentMgr.form.enabled" data-agents-field-enabled /> Enabled
    </label>
    <button type="button" class="px-3 py-1 rounded bg-blue-600 text-white text-sm" :disabled="agentMgr.saving" @click="agentMgrSave()" data-agents-save>Save</button>
  </div>
</div>
`;
