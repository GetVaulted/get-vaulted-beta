import { Linking } from 'react-native';
import { siteUrls } from '../lib/siteUrls';

export function openLegalUrl(path: keyof typeof siteUrls) {
  void Linking.openURL(siteUrls[path]());
}
