import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PlatformFlowHeader } from '../../components/platform/PlatformFlowHeader';
import { HelpArticleBody } from '../../components/help/HelpArticleBody';
import { HELP_ARTICLES, HELP_SECTIONS } from '../../data/helpCenterArticles';
import { openContactSupport } from '../../navigation/openPlatform';
import type { RootStackParamList } from '../../navigation/types';
import { colors, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'HelpArticle'>;

export function HelpArticleScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const article = HELP_ARTICLES.find((a) => a.id === route.params.articleId);
  const sectionTitle = article ? HELP_SECTIONS.find((s) => s.id === article.sectionId)?.title : null;

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
        {sectionTitle ? <Text style={styles.section}>{sectionTitle}</Text> : null}
        <HelpArticleBody body={article.body} />
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
  section: { marginBottom: spacing.sm, color: colors.gold, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  body: { color: colors.textSecondary, fontSize: 15, lineHeight: 24 },
  link: { marginTop: spacing.xl, color: colors.gold, fontWeight: '700', fontSize: 14 },
});
