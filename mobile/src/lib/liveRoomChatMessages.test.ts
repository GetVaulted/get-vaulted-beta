import { dedupeChatMessagesById, tailUniqueChatMessages } from './liveRoomChatMessages';
import type { ChatMessage } from '../types';

function msg(id: string, text: string): ChatMessage {
  return { id, user: 'u', text, isHost: false };
}

describe('liveRoomChatMessages', () => {
  it('dedupes repeated ids in order', () => {
    const input = [msg('a', '1'), msg('b', '2'), msg('a', '1'), msg('c', '3')];
    expect(dedupeChatMessagesById(input).map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('tails unique messages', () => {
    const input = [msg('1', 'a'), msg('2', 'b'), msg('1', 'a'), msg('3', 'c')];
    expect(tailUniqueChatMessages(input, 2).map((m) => m.id)).toEqual(['2', '3']);
  });
});
