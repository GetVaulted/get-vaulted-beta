import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { CreateListingStackParamList } from '../../navigation/types';

export function useCreateListingNavigation() {
  const navigation = useNavigation<NativeStackNavigationProp<CreateListingStackParamList>>();

  const exitFlow = () => {
    navigation.getParent()?.goBack();
  };

  const goBackStep = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('CreateListingChooseChannel');
  };

  return { navigation, exitFlow, goBackStep };
}
