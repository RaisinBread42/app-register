import {EMAIL_PROVIDER, ENV} from './constants';

/** One outbound email. Addresses are already lowercased by the people service. */
export type EmailMessage = {
  from: string;
  to: string[];
  subject: string;
  text: string;
};

/** Thin port every sender talks to. Tests inject a sink; production picks one from env. */
export type EmailPort = {
  send(message: EmailMessage): Promise<void>;
};

/** In-memory sink used for the sink provider and in unit tests. */
export type EmailSink = EmailPort & {messages: EmailMessage[]};

export function createSinkEmail(): EmailSink {
  const messages: EmailMessage[] = [];
  return {
    messages,
    async send(message: EmailMessage): Promise<void> {
      messages.push({
        from: message.from,
        to: [...message.to],
        subject: message.subject,
        text: message.text,
      });
    },
  };
}

/**
 * Builds the email port for the configured provider.
 * Only the sink provider is wired today; a real provider is a later issue.
 */
export function createEmailPort(
  provider: string | undefined = process.env[ENV.emailProvider],
): EmailPort {
  if (provider === EMAIL_PROVIDER.sink || provider === undefined || provider === '') {
    return createSinkEmail();
  }
  throw new Error(`Unknown email provider: ${provider}`);
}
