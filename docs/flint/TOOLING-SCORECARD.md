# Flint Tooling Scorecard

## Session Notes

- Flint core health check was reliable and fast.
- Task queue tools were available and successfully used to load buildout tasks.
- Startup group pre-registration improved MCP tool availability in this session.

## Friction Observed

- Client-side MCP manifest refresh still requires a new chat/window reload after config changes.
- Dynamic tool registration remains less visible to host clients that cache tool manifests.
- `route_and_query` produced generic suggestions that were not grounded in the actual Flint tool catalog for "flint-dev"; this is a good candidate for catalog-aware prompt routing.

## Opportunities

- Keep documenting mismatch between server state and host tool list.
- Prefer startup/pre-registered tool surfaces for high-frequency workflows.
