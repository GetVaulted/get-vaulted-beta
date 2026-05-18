import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PlatformFlowHeader } from '../../components/platform/PlatformFlowHeader';
import { HELP_ARTICLES } from '../../data/helpCenterArticles';
import { openContactSupport } from '../../navigation/openPlatform';
import type { RootStackParamList } from '../../navigation/types';
import { colors, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'HelpArticle'>;

export function HelpArticleScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const article = HELP_ARTICLES.find((a) => a.id === route.params.articleId);

  if (!article) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
        <PlatformFlowHeader title="Article" onBack={() => navigation.goBack()} />
        <Text style={styles.body}>This article is not available.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <PlatformFlowHeader title={article.title} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.body}>{article.body}</Text>
        <Text style={styles.link} onPress={() => openContactSupport({ category: 'other' }, navigation)}>
          Still need help? Contact Support →
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: spacing.lg },
  scroll: { paddingBottom: spacing.xxxl },
  body: { color: colors.textSecondary, fontSize: 15, lineHeight: 24 },
  link: { marginTop: spacing.xl, color: colors.gold, fontWeight: '700', fontSize: 14 },
});
