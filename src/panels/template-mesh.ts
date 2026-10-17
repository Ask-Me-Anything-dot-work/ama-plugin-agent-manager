// Read-only Mesh-agent section (issue #2, What to build 2).
// Zero edit/save/delete affordances — enforced by tests/panel.test.ts.
export const meshSectionHtml = `<div class="mb-4">
  <div class="flex items-center justify-between mb-3">
    <h3 class="text-base font-semibold">Mesh agents</h3>
    <button type="button" class="px-3 py-1 rounded border text-sm" @click="agentMgrRefresh()" data-agents-refresh>Refresh</button>
  </div>
  <p x-show="agentMgr.meshLoading" data-mesh-loading>Loading…</p>
  <p class="text-red-600 text-sm" x-show="!agentMgr.meshLoading && agentMgr.meshError" x-text="agentMgr.meshError" data-mesh-error></p>
  <p x-show="!agentMgr.meshLoading && !agentMgr.meshError && agentMgr.meshAgents.length === 0" data-mesh-empty>No mesh agents found</p>
  <table class="w-full text-sm" x-show="!agentMgr.meshLoading && agentMgr.meshAgents.length > 0">
    <thead>
      <tr class="text-left border-b">
        <th class="py-1 pr-2">Name</th>
        <th class="py-1 pr-2">Description</th>
        <th class="py-1 pr-2">Skills</th>
        <th class="py-1">Details</th>
      </tr>
    </thead>
    <tbody>
      <template x-for="mesh in agentMgr.meshAgents" :key="mesh.repo">
        <tr class="border-b opacity-70">
          <td class="py-1 pr-2">
            <span x-text="mesh.name"></span>
            <span class="ml-2 px-1.5 py-0.5 rounded text-xs bg-gray-200 text-gray-700" data-mesh-badge>Mesh agent</span>
          </td>
          <td class="py-1 pr-2" x-text="mesh.description || '—'"></td>
          <td class="py-1 pr-2" x-text="mesh.skills.map((s) => s.name).join(', ') || '—'"></td>
          <td class="py-1">
            <button type="button" class="text-blue-600" @click="agentMgrOpenDetail(mesh)" data-mesh-view>View</button>
          </td>
        </tr>
      </template>
    </tbody>
  </table>

  <div x-show="agentMgr.detailOpen" class="fixed inset-0 z-50 flex" data-mesh-detail>
    <div class="flex-1 bg-black opacity-50" @click="agentMgrCloseDetail()"></div>
    <div class="w-96 bg-white p-4 overflow-y-auto shadow-lg">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-base font-semibold">
          <span x-text="agentMgr.detailAgent ? agentMgr.detailAgent.name : ''"></span>
          <span class="ml-2 px-1.5 py-0.5 rounded text-xs bg-gray-200 text-gray-700" data-mesh-badge>Mesh agent</span>
        </h3>
        <button type="button" @click="agentMgrCloseDetail()" data-mesh-detail-close>Close</button>
      </div>
      <p class="mb-2 text-sm" x-text="agentMgr.detailAgent ? agentMgr.detailAgent.description : ''"></p>
      <p class="mb-3 text-sm break-all" x-text="agentMgr.detailAgent ? agentMgr.detailAgent.url : ''"></p>
      <h4 class="text-sm font-semibold mb-1">Skills</h4>
      <ul class="text-sm">
        <template x-for="skill in (agentMgr.detailAgent ? agentMgr.detailAgent.skills : [])" :key="skill.id">
          <li x-text="skill.name"></li>
        </template>
      </ul>
    </div>
  </div>
</div>
`;
