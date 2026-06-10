// Единый icon-set (lucide-react) вместо разрозненных эмодзи в данных.
// Данные хранят iconKey-строку; компонент <Icon name={iconKey}/> рендерит line-иконку.
// Один стиль штриха по всему продукту — премиальный, тонкий, как приборка Porsche.
import {
  // анализы / лаборатория
  Droplet, Heart, Candy, FlaskConical, TestTube, Magnet, Pill, Zap, Activity,
  Beaker, Flame, Bandage, Bug, Microscope,
  // спорт
  Footprints, Bike, Waves, Dumbbell,
  // приёмы пищи
  Sunrise, Salad, Apple, Moon, Sun,
  // события
  Phone, CalendarDays, Mail, Users, User,
  // приоритеты / статусы
  AlertTriangle, Circle,
  // интерфейс / ИИ
  Sparkles, Brain, Globe, Settings, X, Check, Bot, Lock, UtensilsCrossed,
} from 'lucide-react'

export const ICONS = {
  // лаборатория (14 групп)
  'lab-blood': Droplet,
  'lab-lipids': Heart,
  'lab-metabolic': Candy,
  'lab-liver': FlaskConical,
  'lab-kidney': TestTube,
  'lab-iron': Magnet,
  'lab-vitamins': Pill,
  'lab-electrolytes': Zap,
  'lab-thyroid': Activity,
  'lab-hormones': Beaker,
  'lab-inflammation': Flame,
  'lab-coagulation': Bandage,
  'lab-infections': Bug,
  'lab-other': Microscope,
  // спорт
  'sport-run': Footprints,
  'sport-bike': Bike,
  'sport-swim': Waves,
  'sport-gym': Dumbbell,
  'sport-walk': Footprints,
  // приёмы пищи
  'meal-breakfast': Sunrise,
  'meal-lunch': Salad,
  'meal-snack': Apple,
  'meal-dinner': Moon,
  // события календаря
  'event-call': Phone,
  'event-calendar': CalendarDays,
  'event-email': Mail,
  'event-meeting': Users,
  'event-personal': User,
  // приоритеты (как маркер; цвет — через StatusPill)
  'priority-urgent': AlertTriangle,
  'priority-important': Circle,
  'priority-normal': Circle,
  // интерфейс / ИИ
  ai: Sparkles,
  bot: Bot,
  memory: Brain,
  lang: Globe,
  settings: Settings,
  close: X,
  check: Check,
  lock: Lock,
  nutrition: UtensilsCrossed,
  health: Heart,
  nap: Sun,
}
