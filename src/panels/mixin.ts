// Browser-safe ESM mixin. Console does `await import(panel.mixinUrl)`
// and calls the default export (Alpine setup fn) with the plugins view's
// shared `data` object — all state lives under data.agentMgr (D4) and all
// handlers are agentMgr*-prefixed to avoid clobbering Plugins panel state.
export const agentsMixinJs = `const AGENT_API = '/plugins/@ama-work/agent-manager';

export default function setup(data) {
  const mgr = {
    agents: [], meshAgents: [], loading: false, meshLoading: false,
    error: null, meshError: null, drawerOpen: false, drawerMode: 'create',
    editingId: null, saving: false, formError: null, form: emptyForm(),
    profiles: [], profilesLoading: false, profilesError: null,
    detailOpen: false, detailAgent: null,
  };
  data.agentMgr = mgr;

  function emptyForm() {
    return { name: '', description: '', instructions: '', model: '', mcp_profile_id: '', enabled: true };
  }
  function messageOf(res, body, fallback) { return body && body.error && body.error.message ? body.error.message : fallback + ' (' + res.status + ')'; }
  data.agentMgrLoadAgents = async function () {
    mgr.loading = true;
    mgr.error = null;
    try {
      const res = await fetch(AGENT_API + '/agents');
      if (!res.ok) throw new Error('Failed to load agents (' + res.status + ')');
      mgr.agents = await res.json();
    } catch (err) {
      mgr.error = err instanceof Error ? err.message : String(err);
    } finally {
      mgr.loading = false;
    }
  };

  data.agentMgrLoadMesh = async function () {
    mgr.meshLoading = true;
    mgr.meshError = null;
    try {
      const res = await fetch(AGENT_API + '/mesh-agents');
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(messageOf(res, body, 'Failed to load mesh agents'));
      mgr.meshAgents = body;
    } catch (err) {
      mgr.meshError = err instanceof Error ? err.message : String(err);
    } finally {
      mgr.meshLoading = false;
    }
  };

  data.agentMgrLoadProfiles = async function () {
    mgr.profilesLoading = true;
    mgr.profilesError = null;
    try {
      const res = await fetch(AGENT_API + '/mcp-profiles');
      const body = await res.json().catch(function () { return null; });
      if (!res.ok) throw new Error(messageOf(res, body, 'Failed to load MCP profiles'));
      mgr.profiles = body.profiles || [];
    } catch (err) {
      mgr.profiles = [];
      mgr.profilesError = err instanceof Error ? err.message : String(err);
    } finally {
      mgr.profilesLoading = false;
    }
  };

  data.agentMgrRefresh = function () {
    data.agentMgrLoadAgents();
    data.agentMgrLoadMesh();
  };

  data.agentMgrOpenCreate = function () {
    mgr.drawerMode = 'create';
    mgr.editingId = null;
    mgr.formError = null;
    mgr.form = emptyForm();
    mgr.drawerOpen = true;
    data.agentMgrLoadProfiles();
  };

  data.agentMgrOpenEdit = function (agent) {
    mgr.drawerMode = 'edit';
    mgr.editingId = agent.id;
    mgr.formError = null;
    mgr.form = {
      name: agent.name,
      description: agent.description || '',
      instructions: agent.instructions,
      model: agent.model,
      mcp_profile_id: agent.mcp_profile_id || '',
      enabled: Boolean(agent.enabled),
    };
    mgr.drawerOpen = true;
    data.agentMgrLoadProfiles();
  };

  data.agentMgrCloseDrawer = function () { mgr.drawerOpen = false; };

  data.agentMgrSave = async function () {
    mgr.formError = null;
    if (!mgr.form.name || !mgr.form.instructions || !mgr.form.model) {
      mgr.formError = 'Name, instructions and model are required';
      return;
    }
    mgr.saving = true;
    try {
      const payload = {
        name: mgr.form.name,
        description: mgr.form.description || null,
        instructions: mgr.form.instructions,
        model: mgr.form.model,
        mcp_profile_id: mgr.form.mcp_profile_id || null,
        enabled: mgr.form.enabled,
      };
      const editing = Boolean(mgr.editingId);
      const url = AGENT_API + '/agents' + (editing ? '/' + encodeURIComponent(mgr.editingId) : '');
      const res = await fetch(url, {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const details = body && body.error && body.error.details;
        const suffix = details && details.length
          ? ': ' + details.map(function (d) { return d.field + ' ' + d.issue; }).join(', ')
          : '';
        throw new Error(messageOf(res, body, 'Save failed') + suffix);
      }
      mgr.drawerOpen = false;
      data.agentMgrLoadAgents();
    } catch (err) {
      mgr.formError = err instanceof Error ? err.message : String(err);
    } finally {
      mgr.saving = false;
    }
  };

  data.agentMgrToggle = async function (agent) {
    const res = await fetch(AGENT_API + '/agents/' + encodeURIComponent(agent.id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !agent.enabled }),
    });
    if (!res.ok) {
      mgr.error = 'Failed to toggle agent (' + res.status + ')';
    }
    data.agentMgrLoadAgents();
  };

  data.agentMgrDelete = async function (agent) {
    const res = await fetch(AGENT_API + '/agents/' + encodeURIComponent(agent.id), { method: 'DELETE' });
    if (!res.ok && res.status !== 404) {
      mgr.error = 'Failed to delete agent (' + res.status + ')';
    }
    data.agentMgrLoadAgents();
  };

  data.agentMgrOpenDetail = function (mesh) {
    mgr.detailAgent = mesh;
    mgr.detailOpen = true;
  };

  data.agentMgrCloseDetail = function () { mgr.detailOpen = false; };

  data.agentMgrRefresh();
}
`;
