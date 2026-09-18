// A single icon set (lucide-react) instead of assorted emoji scattered through the data.
// The data stores an iconKey string; <Icon name={iconKey}/> renders the matching line icon.
// One stroke style across the whole product — premium and thin, like a Porsche gauge cluster.
import {
  // blood tests / lab
  Droplet, Heart, Candy, FlaskConical, TestTube, Magnet, Pill, Zap, Activity,
  Beaker, Flame, Bandage, Bug, Microscope,
  // sport
  Footprints, Bike, Waves, Dumbbell,
  // meals
  Sunrise, Salad, Apple, Moon, Sun,
  // events
  Phone, CalendarDays, Mail, Users, User,
  // priorities / statuses
  AlertTriangle, Circle,
  // UI / AI
  Sparkles, Brain, Globe, Settings, X, Check, Bot, Lock, UtensilsCrossed,
  // household tasks
  CheckSquare,
} from 'lucide-react'

export const ICONS = {
  // lab (14 groups)
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
  // sport
  'sport-run': Footprints,
  'sport-bike': Bike,
  'sport-swim': Waves,
  'sport-gym': Dumbbell,
  'sport-walk': Footprints,
  // meals
  'meal-breakfast': Sunrise,
  'meal-lunch': Salad,
  'meal-snack': Apple,
  'meal-dinner': Moon,
  // calendar events
  'event-call': Phone,
  'event-calendar': CalendarDays,
  'event-email': Mail,
  'event-meeting': Users,
  'event-workout': Activity,
  'event-personal': User,
  // priorities (used as a marker; the color comes from StatusPill)
  'priority-urgent': AlertTriangle,
  'priority-important': Circle,
  'priority-normal': Circle,
  // UI / AI
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
  // household tasks
  tasks: CheckSquare,
  helper: Users,
}
