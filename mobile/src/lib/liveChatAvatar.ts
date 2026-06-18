import { profileDisplayInitial } from './profileAvatar';

/** First letter of username for chat avatar fallback. */
export function liveChatUsernameInitial(username: string | null | undefined): string {
  return profileDisplayInitial(username);
}
