import { createFinanceMcpHandler } from './_lib/handler';

export const maxDuration = 60;

const handler = createFinanceMcpHandler();

export { handler as GET, handler as POST, handler as DELETE };
export default handler;
