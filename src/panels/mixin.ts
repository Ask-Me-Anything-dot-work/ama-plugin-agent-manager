// Browser-safe ESM mixin. Console does `await import(panel.mixinUrl)`
// and calls the default export (Alpine setup fn) with panel data.
export const agentsMixinJs = `export default function setup(data) {
  data.agents = [];
  data.loading = false;
}
`;
