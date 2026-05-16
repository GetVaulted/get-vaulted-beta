import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import type { CreateListingStackParamList } from './types';
import { navigateAuthLogin } from './rootNavigationRef';
import { colors } from '../theme';
import { CreateListingChooseChannelScreen } from '../screens/createListing/CreateListingChooseChannelScreen';
import {
  CreateListingCategoryScreen,
  CreateListingDetailsScreen,
  CreateListingMediaScreen,
  CreateListingTypeScreen,
} from '../screens/createListing/createListingStepsPartA';
import {
  CreateListingLiveShippingScreen,
  CreateListingPricingScreen,
  CreateListingReviewScreen,
  CreateListingShippingScreen,
} from '../screens/createListing/createListingStepsPartB';

const Stack = createNativeStackNavigator<CreateListingStackParamList>();

export function CreateListingNavigator() {
  const { user, loading } = useAuth();
  const navigation = useNavigation();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      const t = setTimeout(() => {
        if (navigation.canGoBack()) navigation.goBack();
        navigateAuthLogin();
      }, 0);
      return () => clearTimeout(t);
    }
  }, [loading, user, navigation]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.gold} size="large" />
      </View>
    );
  }

  if (!user) {
    return <View style={styles.centered} />;
  }

  return (
    <Stack.Navigator
      initialRouteName="CreateListingChooseChannel"
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="CreateListingChooseChannel" component={CreateListingChooseChannelScreen} />
      <Stack.Screen name="CreateListingMedia" component={CreateListingMediaScreen} />
      <Stack.Screen name="CreateListingType" component={CreateListingTypeScreen} />
      <Stack.Screen name="CreateListingCategory" component={CreateListingCategoryScreen} />
      <Stack.Screen name="CreateListingDetails" component={CreateListingDetailsScreen} />
      <Stack.Screen name="CreateListingPricing" component={CreateListingPricingScreen} />
      <Stack.Screen name="CreateListingShipping" component={CreateListingShippingScreen} />
      <Stack.Screen name="CreateListingLiveShipping" component={CreateListingLiveShippingScreen} />
      <Stack.Screen name="CreateListingReview" component={CreateListingReviewScreen} />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' },
});
