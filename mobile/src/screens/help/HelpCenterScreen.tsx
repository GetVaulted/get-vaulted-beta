import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { PlatformFlowHeader } from '../../components/platform/PlatformFlowHeader';
import { HELP_ARTICLES, HELP_SECTIONS, searchHelpArticles } from '../../data/helpCenterArticles';
import { openHelpArticle } from '../../navigation/openPlatform';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'HelpCenter'>;

export function HelpCenterScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const focusSearch = route.params?.focusSearch;

  const results = useMemo(() => searchHelpArticles(query), [query]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <PlatformFlowHeader title="Help Center" subtitle="Trust, trades, and vault commerce" onBack={() => navigation.goBack()} />
      <View style={styles.search}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search help articles…"
          placeholderTextColor={colors.textMuted}
          autoFocus={focusSearch}
        />
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {query.trim() ? (
          results.map((a) => (
            <Pressable key={a.id} style={styles.article} onPress={() => openHelpArticle(a.id, navigation)}>
              <Text style={styles.articleTitle}>{a.title}</Text>
              <Text style={styles.articleSub}>{a.summary}</Text>
            </Pressable>
          ))
        ) : (
          HELP_SECTIONS.map((section) => {
            const articles = HELP_ARTICLES.filter((a) => a.sectionId === section.id);
            if (!articles.length) return null;
            return (
              <View key={section.id} style={styles.section}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                {articles.map((a) => (
                  <Pressable key={a.id} style={styles.article} onPress={() => openHelpArticle(a.id, navigation)}>
                    <Text style={styles.articleTitle}>{a.title}</Text>
                    <Text style={styles.articleSub}>{a.summary}</Text>
                  </Pressable>
                ))}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: spacing.lg },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    marginBottom: spacing.md,
  },
  searchInput: { flex: 1, color: colors.textPrimary, fontSize: 15, paddingVertical: 4 },
  scroll: { paddingBottom: spacing.xxxl, gap: spacing.lg },
  section: { gap: spacing.sm },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: colors.gold, letterSpacing: 0.6, textTransform: 'uppercase' },
  article: {
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    gap: 4,
  },
  articleTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  articleSub: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
});
