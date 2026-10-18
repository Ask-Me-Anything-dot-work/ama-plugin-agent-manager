// Chat drawer handlers (issue #3). Plain JS chunk concatenated into
// agentsMixinJs inside setup() — shares AGENT_API, mgr, messageOf closures.
// Split out of mixin.ts solely for the max-lines(150) lint rule.
export const chatHandlersJs = `  mgr.chat = {
    open: false,
    agentId: null,
    agentName: '',
    status: 'idle',
    messages: [],
    input: '',
    error: null,
    sessions: [],
    sessionId: null,
    loadingSessions: false,
  };

  data.agentMgrOpenChat = async function (agent) {
    mgr.chat.open = true;
    mgr.chat.agentId = agent.id;
    mgr.chat.agentName = agent.name;
    mgr.chat.messages = [];
    mgr.chat.sessionId = null;
    mgr.chat.status = 'idle';
    mgr.chat.error = null;
    mgr.chat.input = '';
    await data.agentMgrLoadChatSessions();
  };

  data.agentMgrCloseChat = function () {
    mgr.chat.open = false;
    mgr.chat.status = 'idle';
  };

  data.agentMgrLoadChatSessions = async function () {
    if (!mgr.chat.agentId) return;
    mgr.chat.loadingSessions = true;
    try {
      const res = await fetch(
        AGENT_API + '/agents/' + encodeURIComponent(mgr.chat.agentId) + '/chat/sessions',
      );
      if (!res.ok) throw new Error('Failed to load history (' + res.status + ')');
      mgr.chat.sessions = await res.json();
    } catch (err) {
      mgr.chat.error = err instanceof Error ? err.message : String(err);
    } finally {
      mgr.chat.loadingSessions = false;
    }
  };

  data.agentMgrOpenChatSession = async function (sid) {
    if (!mgr.chat.agentId) return;
    mgr.chat.error = null;
    try {
      const res = await fetch(
        AGENT_API + '/agents/' + encodeURIComponent(mgr.chat.agentId) +
          '/chat/sessions/' + encodeURIComponent(sid),
      );
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(messageOf(res, body, 'Failed to load conversation'));
      mgr.chat.sessionId = sid;
      mgr.chat.messages = body.messages.map(function (m) {
        return { role: m.role, content: m.content };
      });
      mgr.chat.status = 'idle';
    } catch (err) {
      mgr.chat.error = err instanceof Error ? err.message : String(err);
    }
  };

  data.agentMgrNewConversation = function () {
    mgr.chat.sessionId = null;
    mgr.chat.messages = [];
    mgr.chat.status = 'idle';
    mgr.chat.error = null;
  };

  data.agentMgrSendChat = async function () {
    const text = mgr.chat.input.trim();
    if (!text || !mgr.chat.agentId) return;
    if (mgr.chat.status === 'sending' || mgr.chat.status === 'running') return;
    mgr.chat.error = null;
    mgr.chat.messages.push({ role: 'user', content: text });
    mgr.chat.input = '';
    mgr.chat.status = 'sending';
    try {
      const res = await fetch(
        AGENT_API + '/agents/' + encodeURIComponent(mgr.chat.agentId) + '/chat',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, session_id: mgr.chat.sessionId || undefined }),
        },
      );
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(messageOf(res, body, 'Chat request failed'));
      mgr.chat.sessionId = body.session_id;
      if (body.status === 'done') {
        mgr.chat.messages.push({ role: 'assistant', content: body.reply || '' });
        mgr.chat.status = 'done';
        data.agentMgrLoadChatSessions();
        return;
      }
      if (body.status === 'failed') {
        mgr.chat.error = body.error || 'Job failed';
        mgr.chat.status = 'error';
        return;
      }
      mgr.chat.status = 'running';
      await data.agentMgrPollChatJob(body.job_id);
    } catch (err) {
      mgr.chat.error = err instanceof Error ? err.message : String(err);
      mgr.chat.status = 'error';
    }
  };

  // Resume poll (plan D1 valve): POST returned running + job_id; poll the
  // resume endpoint until terminal. Bounded client deadline — no zombie
  // 'running' state without an error (AC).
  data.agentMgrPollChatJob = async function (jobId) {
    const deadline = Date.now() + 180000;
    while (mgr.chat.status === 'running' && Date.now() < deadline) {
      await new Promise(function (r) { setTimeout(r, 2000); });
      let body = null;
      try {
        const res = await fetch(
          AGENT_API + '/agents/' + encodeURIComponent(mgr.chat.agentId) +
            '/chat/jobs/' + encodeURIComponent(jobId),
        );
        body = await res.json().catch(function () { return null; });
        if (!res.ok) throw new Error(messageOf(res, body, 'Job poll failed'));
      } catch (err) {
        mgr.chat.error = err instanceof Error ? err.message : String(err);
        mgr.chat.status = 'error';
        return;
      }
      if (body.status === 'done') {
        mgr.chat.messages.push({ role: 'assistant', content: body.reply || '' });
        mgr.chat.status = 'done';
        data.agentMgrLoadChatSessions();
        return;
      }
      if (body.status === 'failed') {
        mgr.chat.error = body.error || 'Job failed';
        mgr.chat.status = 'error';
        return;
      }
    }
    if (mgr.chat.status === 'running') {
      mgr.chat.error = 'Still running — close and reopen the chat to check again (job ' + jobId + ')';
      mgr.chat.status = 'error';
    }
  };
`;
