export type InboundMessage = { text: string; jid: string };
export type MessageHandler = (
  msg: InboundMessage,
) => Promise<string | null> | string | null;
