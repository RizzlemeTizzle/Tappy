import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

type FaqItem = {
  id: number;
  category: string;
  questionKey: string;
  answerKey: string;
};

const FAQ_ITEMS: FaqItem[] = [
  { id: 1,  category: 'gettingStarted', questionKey: 'q1',  answerKey: 'a1'  },
  { id: 2,  category: 'gettingStarted', questionKey: 'q2',  answerKey: 'a2'  },
  { id: 3,  category: 'gettingStarted', questionKey: 'q3',  answerKey: 'a3'  },
  { id: 4,  category: 'billing',        questionKey: 'q4',  answerKey: 'a4'  },
  { id: 5,  category: 'billing',        questionKey: 'q5',  answerKey: 'a5'  },
  { id: 6,  category: 'billing',        questionKey: 'q6',  answerKey: 'a6'  },
  { id: 7,  category: 'chargers',       questionKey: 'q7',  answerKey: 'a7'  },
  { id: 8,  category: 'chargers',       questionKey: 'q8',  answerKey: 'a8'  },
  { id: 9,  category: 'chargers',       questionKey: 'q9',  answerKey: 'a9'  },
  { id: 10, category: 'nfc',            questionKey: 'q10', answerKey: 'a10' },
  { id: 11, category: 'nfc',            questionKey: 'q11', answerKey: 'a11' },
  { id: 12, category: 'account',        questionKey: 'q12', answerKey: 'a12' },
  { id: 13, category: 'account',        questionKey: 'q13', answerKey: 'a13' },
];

const CATEGORY_ORDER = ['gettingStarted', 'billing', 'chargers', 'nfc', 'account'];

export default function FaqScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const toggleItem = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const grouped = CATEGORY_ORDER.reduce<Record<string, FaqItem[]>>((acc, cat) => {
    acc[cat] = FAQ_ITEMS.filter((item) => item.category === cat);
    return acc;
  }, {});

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('faq.title')}</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {CATEGORY_ORDER.map((category) => (
          <View key={category} style={styles.section}>
            <Text style={styles.sectionTitle}>
              {t(`faq.categories.${category}`)}
            </Text>
            <View style={styles.card}>
              {grouped[category].map((item, index) => {
                const isExpanded = expandedIds.has(item.id);
                const isLast = index === grouped[category].length - 1;
                return (
                  <View key={item.id}>
                    <TouchableOpacity
                      style={styles.questionRow}
                      onPress={() => toggleItem(item.id)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.questionText}>
                        {t(`faq.items.${item.questionKey}`)}
                      </Text>
                      <Ionicons
                        name={isExpanded ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color="#888"
                      />
                    </TouchableOpacity>
                    {isExpanded && (
                      <View style={styles.answerContainer}>
                        <Text style={styles.answerText}>
                          {t(`faq.items.${item.answerKey}`)}
                        </Text>
                      </View>
                    )}
                    {!isLast && <View style={styles.divider} />}
                  </View>
                );
              })}
            </View>
          </View>
        ))}
        <View style={styles.bottomPadding} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    color: '#888',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#1E1E1E',
    borderRadius: 14,
    overflow: 'hidden',
  },
  questionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  questionText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 20,
  },
  answerContainer: {
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  answerText: {
    color: '#AAA',
    fontSize: 14,
    lineHeight: 21,
  },
  divider: {
    height: 1,
    backgroundColor: '#2A2A2A',
    marginHorizontal: 16,
  },
  bottomPadding: {
    height: 32,
  },
});
