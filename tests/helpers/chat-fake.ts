import type { OrchestratorChatClient } from '../../src/clients/orchestrator.client.js';
import type {
  EnqueueChatPayload,
  EnqueueChatResult,
  OrchestratorJobSnapshot,
} from '../../src/types/chat.js';
import { createChatRouter } from '../../src/routes/chat.route.js';
import { ChatService } from '../../src/services/chat.service.js';
import { InMemoryAgentsRepository } from './agents-repo.js';
import { InMemoryChatRepository } from './chat-repo.js';

// Scriptable orchestrator fake shared by chat service + route tests.
export function fakeOrchestratorClient() {
  const state = {
    enqueued: [] as EnqueueChatPayload[],
    jobs: new Map<string, OrchestratorJobSnapshot>(),
    enqueueError: null as Error | null,
    counter: 0,
  };
  const client: OrchestratorChatClient = {
    async enqueueChat(payload: EnqueueChatPayload): Promise<EnqueueChatResult> {
      if (state.enqueueError) throw state.enqueueError;
      state.enqueued.push(payload);
      const jobId = `job-${++state.counter}`;
      if (!state.jobs.has(jobId)) {
        state.jobs.set(jobId, { status: 'done', output: 'ok', error: null });
      }
      return { job_id: jobId };
    },
    async getJob(jobId: string): Promise<OrchestratorJobSnapshot> {
      return state.jobs.get(jobId) ?? { status: 'running', output: null, error: null };
    },
  };
  return { client, state };
}

export async function seedAgent(
  agents: InMemoryAgentsRepository,
  id: string,
  name: string,
  mcpProfileId: string | null = null,
) {
  return agents.create({
    id,
    name,
    description: null,
    instructions: 'do things',
    model: 'test-model',
    mcp_profile_id: mcpProfileId,
    enabled: true,
    created_at: new Date(),
    updated_at: new Date(),
  });
}

export interface ChatTestBed {
  agents: InMemoryAgentsRepository;
  agent: Awaited<ReturnType<typeof seedAgent>>;
  chat: InMemoryChatRepository;
  state: ReturnType<typeof fakeOrchestratorClient>['state'];
  service: ChatService;
  router: ReturnType<typeof createChatRouter>;
}

export async function createChatTestBed(mcpProfileId: string | null = 'prof-1'): Promise<ChatTestBed> {
  const agents = new InMemoryAgentsRepository();
  const agent = await seedAgent(agents, 'a1', 'demo', mcpProfileId);
  const chat = new InMemoryChatRepository();
  const { client, state } = fakeOrchestratorClient();
  const service = new ChatService({
    agents,
    chat,
    client,
    pollTimeoutMs: 50,
    pollIntervalMs: 1,
    sleep: async () => {},
  });
  return { agents, agent, chat, state, service, router: createChatRouter(service) };
}
