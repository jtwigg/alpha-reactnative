import { createFinanceMcpHandler } from './_lib/handler';

export const maxDuration = 60;

const handler = createFinanceMcpHandler();

// Web Request handlers only. A default export makes Vercel use the Node
// (req, res) adapter, so request.headers.get throws.
export { handler as GET, handler as POST, handler as DELETE };
