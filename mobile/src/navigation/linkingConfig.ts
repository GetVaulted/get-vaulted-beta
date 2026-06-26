import type { LinkingOptions } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import type { RootStackParamList } from './types';

const expoPrefix = Linking.createURL('/');

/** Deep links + Universal Links for shared live show URLs. */
export const navigationLinking: LinkingOptions<RootStackParamList> = {
  prefixes: [
    expoPrefix,
    'getvaulted://',
    'https://shopgetvaulted.com',
    'https://www.shopgetvaulted.com',
    'https://beta.shopgetvaulted.com',
  ],
  config: {
    screens: {
      MainTabs: {
        screens: {
          Live: {
            path: 'live',
            screens: {
              LiveDiscovery: '',
              LiveRoom: ':streamId',
            },
          },
        },
      },
      ProductDetail: 'listing/:productId',
    },
  },
};
