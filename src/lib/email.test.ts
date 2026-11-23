import {describe, expect, it} from 'vitest';
import {EMAIL_PROVIDER} from './constants';
import {createEmailPort, createSinkEmail} from './email';

describe('email port', () => {
  it('the sink records every message so tests can assert what was sent', async () => {
    const sink = createSinkEmail();
    await sink.send({
      from: 'alerts@example.com',
      to: ['ada@example.test', 'ben@example.test'],
      subject: 'Notice deadline in 30 days: Contoso CRM',
      text: 'Give notice before 2026-12-31.',
    });
    expect(sink.messages).toEqual([
      {
        from: 'alerts@example.com',
        to: ['ada@example.test', 'ben@example.test'],
        subject: 'Notice deadline in 30 days: Contoso CRM',
        text: 'Give notice before 2026-12-31.',
      },
    ]);
  });

  it('EMAIL_PROVIDER=sink builds a sink; an unknown provider is refused', () => {
    expect(createEmailPort(EMAIL_PROVIDER.sink)).toMatchObject({messages: []});
    expect(() => createEmailPort('smtp')).toThrow(/Unknown email provider/);
  });
});
