// MCP profile picker handlers (issue #4). Plain JS chunk concatenated into
// agentsMixinJs inside setup() — shares AGENT_API, mgr, messageOf closures.
// Split out of mixin.ts solely for the max-lines(150) lint rule.
export const profileHandlersJs = `  data.agentMgrLoadProfiles = async function () {
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
`;
