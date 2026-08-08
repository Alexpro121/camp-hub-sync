import { Utensils, Activity, ShoppingBag, Sparkles, Navigation, Compass, type LucideIcon } from 'lucide-react';

/** Pick a vector icon for a schedule event from its title and category. */
export function getEventCategoryIcon(title: string, category?: string | null): LucideIcon {
  const text = `${title} ${category || ''}`.toLowerCase();
  if (/обід|сніданок|вечеря|чай|смаколики|їдальня|харчування|meal/.test(text)) return Utensils;
  if (/йога|зарядка|спорт|футбол|скелелазіння|турнір|активн|sports/.test(text)) return Activity;
  if (/ярмарок|ярмарка|покупк|ринки/.test(text)) return ShoppingBag;
  if (/таланти|концерт|свічка|дискотека|ватра|entertainment/.test(text)) return Sparkles;
  if (/виїзд|буковель|потяг|трансфер|автобус|transfer/.test(text)) return Navigation;
  return Compass;
}
