import { describe, expect, it } from 'vitest';
import { parseAgoraHostSession, parseHostPublisher } from './agoraHostRepository';

describe('parseHostPublisher', () => {
  it('selects Agora only with an App ID', () => {
    expect(parseHostPublisher({ publisher: 'agora', agoraAppId: ' abc123 ' })).toEqual({
      publisher: 'agora',
      agoraAppId: 'abc123',
    });
    expect(parseHostPublisher({ publisher: 'agora', agoraAppId: null })).toEqual({ publisher: 'aws_ivs', agoraAppId: null });
  });

  it('defaults to AWS for anything else', () => {
    expect(parseHostPublisher({ publisher: 'aws_ivs' }).publisher).toBe('aws_ivs');
    expect(parseHostPublisher(null).publisher).toBe('aws_ivs');
    expect(parseHostPublisher('x').publisher).toBe('aws_ivs');
    expect(parseHostPublisher({ publisher: 'something' }).publisher).toBe('aws_ivs');
  });
});

describe('parseAgoraHostSession', () => {
  const good = { agora: { appId: 'app', channel: 'gv-room', uid: 42, token: 'tok', expiresInSeconds: 43200 } };

  it('reads a complete session', () => {
    expect(parseAgoraHostSession(good)).toEqual({
      appId: 'app',
      channel: 'gv-room',
      uid: 42,
      token: 'tok',
      expiresInSeconds: 43200,
    });
  });

  it('rejects incomplete sessions', () => {
    expect(parseAgoraHostSession({})).toBeNull();
    expect(parseAgoraHostSession({ agora: { ...good.agora, token: '' } })).toBeNull();
    expect(parseAgoraHostSession({ agora: { ...good.agora, uid: 0 } })).toBeNull();
    expect(parseAgoraHostSession({ agora: { ...good.agora, channel: ' ' } })).toBeNull();
    expect(parseAgoraHostSession(null)).toBeNull();
  });
});
