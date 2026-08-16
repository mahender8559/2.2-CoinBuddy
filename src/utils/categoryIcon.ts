import { icons, type IconName } from '../icons';
import type { Category } from '../types';

type CategoryType = 'expense' | 'income';

type CategoryIconRule = {
  keywords: string[];
  icons: IconName[];
  type?: CategoryType;
};

const RULES: CategoryIconRule[] = [
  { type: 'income', keywords: ['salary', 'wage', 'paycheck', 'payroll'], icons: ['Banknote', 'Briefcase'] },
  { type: 'income', keywords: ['freelance', 'contract', 'consulting', 'business', 'client'], icons: ['Briefcase', 'Code', 'Building'] },
  { type: 'income', keywords: ['dividend', 'interest', 'return', 'cashback', 'refund', 'bonus', 'reward'], icons: ['Percent', 'Landmark', 'Gift', 'Banknote'] },
  { type: 'income', keywords: ['rent', 'rental'], icons: ['Home', 'Building', 'Banknote'] },

  { keywords: ['food', 'dining', 'restaurant', 'meal', 'lunch', 'dinner', 'breakfast'], icons: ['Utensils', 'Coffee'] },
  { keywords: ['coffee', 'cafe', 'tea'], icons: ['Coffee', 'Utensils'] },
  { keywords: ['grocery', 'groceries', 'supermarket', 'market'], icons: ['ShoppingBag', 'Utensils'] },
  { keywords: ['petrol', 'fuel', 'diesel', 'taxi', 'uber', 'ola', 'cab', 'commute', 'transport', 'vehicle', 'car', 'auto', 'bus', 'train'], icons: ['Car', 'MapPin', 'Map'] },
  { keywords: ['rent', 'mortgage', 'housing', 'house', 'home'], icons: ['Home', 'Building'] },
  { keywords: ['electricity', 'power', 'utility', 'utilities'], icons: ['Zap', 'Home'] },
  { keywords: ['water'], icons: ['Droplet', 'Home'] },
  { keywords: ['internet', 'mobile', 'phone', 'recharge'], icons: ['Smartphone', 'Zap'] },
  { keywords: ['shopping', 'clothes', 'clothing', 'fashion', 'mall', 'purchase'], icons: ['ShoppingBag', 'Tag'] },
  { keywords: ['education', 'tuition', 'school', 'college', 'university', 'course', 'learning'], icons: ['GraduationCap', 'Book'] },
  { keywords: ['book', 'books', 'reading'], icons: ['Book', 'GraduationCap'] },
  { keywords: ['health', 'medical', 'doctor', 'hospital', 'medicine', 'pharmacy'], icons: ['Heart', 'Activity'] },
  { keywords: ['gym', 'fitness', 'workout', 'sport'], icons: ['Activity', 'Heart'] },
  { keywords: ['travel', 'flight', 'hotel', 'vacation', 'holiday', 'trip'], icons: ['Plane', 'Map', 'MapPin'] },
  { keywords: ['movie', 'cinema', 'film', 'netflix', 'streaming'], icons: ['Film', 'Camera'] },
  { keywords: ['music', 'concert', 'spotify'], icons: ['Music', 'Film'] },
  { keywords: ['photo', 'camera', 'photography'], icons: ['Camera', 'MapPin'] },
  { keywords: ['gift', 'birthday', 'present'], icons: ['Gift', 'Heart'] },
  { keywords: ['donation', 'charity'], icons: ['Gift', 'Heart'] },
  { keywords: ['loan', 'emi', 'debt', 'credit card', 'card repayment', 'repayment'], icons: ['CreditCard', 'Percent', 'Landmark'] },
  { keywords: ['tax', 'gst'], icons: ['Percent', 'Landmark'] },
  { keywords: ['investment', 'investing', 'savings', 'saving', 'sip', 'mutual fund', 'stock', 'equity'], icons: ['Target', 'Landmark', 'Percent'] },
  { keywords: ['subscription', 'membership', 'renewal'], icons: ['Bell', 'Smartphone'] },
  { keywords: ['insurance'], icons: ['Landmark', 'Heart'] },
  { keywords: ['emergency'], icons: ['Crosshair', 'Heart'] },
  { keywords: ['work', 'office'], icons: ['Briefcase', 'Building'] },
];

const TYPE_FALLBACKS: Record<CategoryType, IconName[]> = {
  income: ['Banknote', 'Briefcase', 'Landmark', 'Building', 'Target', 'Percent', 'Gift'],
  expense: ['Tag', 'ShoppingBag', 'CreditCard', 'Home', 'Car', 'Activity', 'Bell', 'Banknote'],
};

const ALL_ICONS = Object.keys(icons) as IconName[];

function normalizeName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function unique<T>(values: T[]) {
  return values.filter((value, index) => values.indexOf(value) === index);
}

function isIconName(value: string | undefined): value is IconName {
  return Boolean(value && value in icons);
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export type CategoryIconSelectionInput = {
  name: string;
  type: CategoryType;
  categories: Array<Pick<Category, 'id' | 'icon'>>;
  editingId?: string;
  preferredIcon?: string;
};

/**
 * Selects a category icon automatically from the category name and type.
 *
 * Priority:
 * 1. Unused icon that is semantically relevant to the name/type.
 * 2. Any unused icon from the library, keeping categories visually distinct.
 * 3. A relevant icon even if all icons are already in use.
 *
 * The current category is excluded from the used set while editing, and an
 * existing relevant icon is preferred so harmless edits do not reshuffle it.
 */
export function selectCategoryIcon({ name, type, categories, editingId, preferredIcon }: CategoryIconSelectionInput): IconName {
  const normalized = normalizeName(name);
  const used = new Set<IconName>();

  for (const category of categories) {
    if (category.id === editingId) continue;
    if (isIconName(category.icon)) used.add(category.icon);
  }

  const matched = RULES
    .filter(rule => (!rule.type || rule.type === type) && rule.keywords.some(keyword => normalized.includes(keyword)))
    .sort((a, b) => {
      const aLength = Math.max(...a.keywords.filter(keyword => normalized.includes(keyword)).map(keyword => keyword.length), 0);
      const bLength = Math.max(...b.keywords.filter(keyword => normalized.includes(keyword)).map(keyword => keyword.length), 0);
      return bLength - aLength;
    });

  const relevant = unique([
    ...matched.flatMap(rule => rule.icons),
    ...TYPE_FALLBACKS[type],
  ]);

  if (isIconName(preferredIcon) && relevant.includes(preferredIcon) && !used.has(preferredIcon)) {
    return preferredIcon;
  }

  const unusedRelevant = relevant.find(icon => !used.has(icon));
  if (unusedRelevant) return unusedRelevant;

  const unused = ALL_ICONS.filter(icon => !used.has(icon));
  if (unused.length > 0) {
    return unused[stableHash(`${type}:${normalized || 'category'}`) % unused.length];
  }

  if (isIconName(preferredIcon)) return preferredIcon;
  return relevant[0] ?? (type === 'income' ? 'Banknote' : 'Tag');
}
