import { describe, expect, it } from 'vitest';
import { parseAgoraViewerSession } from './agoraViewerRepository';

const GOOD = { agora: { appId: 'app', channel: 'gv-r1', hostUid: 7, uid: 0, token: 'tok', expiresInSeconds: 7200 } };

describe('parseAgoraViewerSession', () => {
  it('reads a valid viewer pass', () => {
    expect(parseAgoraViewerSession(GOOD)).toEqual(GOOD.agora);
  });

  it('rejects incomplete or malformed payloads', () => {
    expect(parseAgoraViewerSession(null)).toBeNull();
    expect(parseAgoraViewerSession({})).toBeNull();
    expect(parseAgoraViewerSession({ agora: { ...GOOD.agora, token: '' } })).toBeNull();
    expect(parseAgoraViewerSession({ agora: { ...GOOD.agora, hostUid: 0 } })).toBeNull();
    expect(parseAgoraViewerSession({ agora: { ...GOOD.agora, appId: ' ' } })).toBeNull();
  });
});
