import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../../theme';

function isBulletLine(line: string): boolean {
  return line.startsWith('• ') || line.startsWith('- ');
}

function isNumberedLine(line: string): boolean {
  return /^\d+\.\s/.test(line);
}

function BulletList({ lines }: { lines: string[] }) {
  return (
    <View style={styles.listBlock}>
      {lines.map((line, i) => (
        <View key={i} style={styles.bulletRow}>
          <Text style={styles.bulletMark}>•</Text>
          <Text style={styles.listText}>{line.replace(/^[•-]\s*/, '')}</Text>
        </View>
      ))}
    </View>
  );
}

function NumberedList({ lines }: { lines: string[] }) {
  return (
    <View style={styles.listBlock}>
      {lines.map((line, i) => (
        <Text key={i} style={styles.numberedLine}>
          {line}
        </Text>
      ))}
    </View>
  );
}

export function HelpArticleBody({ body }: { body: string }) {
  const blocks = body.split(/\n\n+/).filter(Boolean);

  return (
    <View style={styles.wrap}>
      {blocks.map((block, blockIdx) => {
        const lines = block.split('\n').filter((l) => l.trim().length > 0);
        const bulletLines = lines.filter(isBulletLine);
        const numberedLines = lines.filter(isNumberedLine);
        const proseLines = lines.filter((l) => !isBulletLine(l) && !isNumberedLine(l));

        if (bulletLines.length > 0 && bulletLines.length === lines.length) {
          return <BulletList key={blockIdx} lines={bulletLines} />;
        }

        if (numberedLines.length > 0 && numberedLines.length === lines.length) {
          return <NumberedList key={blockIdx} lines={numberedLines} />;
        }

        if (bulletLines.length > 0 || numberedLines.length > 0) {
          return (
            <View key={blockIdx} style={styles.mixedBlock}>
              {proseLines.map((line, i) => (
                <Text key={`p-${i}`} style={styles.paragraph}>
                  {line}
                </Text>
              ))}
              {numberedLines.length ? <NumberedList lines={numberedLines} /> : null}
              {bulletLines.length ? <BulletList lines={bulletLines} /> : null}
            </View>
          );
        }

        return (
          <Text key={blockIdx} style={styles.paragraph}>
            {block}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  mixedBlock: { gap: spacing.sm },
  paragraph: { color: colors.textSecondary, fontSize: 15, lineHeight: 24 },
  listBlock: { gap: spacing.xs },
  bulletRow: { flexDirection: 'row', gap: spacing.sm, paddingRight: spacing.sm },
  bulletMark: { color: colors.gold, fontSize: 15, lineHeight: 24, width: 12 },
  listText: { flex: 1, color: colors.textSecondary, fontSize: 15, lineHeight: 24 },
  numberedLine: { color: colors.textSecondary, fontSize: 15, lineHeight: 24, paddingLeft: spacing.xs },
});
