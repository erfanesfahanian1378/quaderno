import "@testing-library/jest-dom/vitest";

/**
 * Integration tests import their own env defaults from
 * `tests/setup/integration.ts`; this file stays limited to things every test
 * needs, so a unit run never touches the network or a database.
 */
