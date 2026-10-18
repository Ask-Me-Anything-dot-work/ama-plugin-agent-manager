import { chatDrawerHtml } from './template-chat.js';
import { managedSectionHtml } from './template-managed.js';
import { meshSectionHtml } from './template-mesh.js';

// HTML fragment — orchestrator console injects via innerHTML.
// No <!doctype>/<html>/<head>/<body>/<style>/<script>; no 100vh.
export const agentsPanelHtml = `<div class="p-4">
  <h2 class="text-lg font-semibold mb-2">Agents</h2>
  ${managedSectionHtml}
  ${meshSectionHtml}
  ${chatDrawerHtml}
</div>
`;
