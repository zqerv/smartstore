import { logger } from '../logger';

export type MessageChannel = 'sms' | 'email';

export interface OutboundMessage {
  channel: MessageChannel;
  to: string;
  subject?: string;
  body: string;
}

export interface MessageProvider {
  readonly name: string;
  readonly configured: boolean;
  send(message: OutboundMessage): Promise<{ delivered: boolean; reason?: string }>;
}

// Used until a real SMS/email adapter is registered. It never reports delivery.
class UnconfiguredMessageProvider implements MessageProvider {
  readonly name = 'unconfigured';
  readonly configured = false;

  async send(message: OutboundMessage) {
    logger.warn(`PROVIDER CONFIGURATION REQUIRED: ${message.channel} delivery is not configured; message was not sent`);
    return { delivered: false, reason: 'PROVIDER_NOT_CONFIGURED' };
  }
}

let provider: MessageProvider = new UnconfiguredMessageProvider();

export function registerMessageProvider(next: MessageProvider) {
  provider = next;
}

export function getMessageProvider(): MessageProvider {
  return provider;
}
