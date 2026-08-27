// Набор мотивационно-философских цитат. Ротация — новая каждый день.
// Каждая цитата двуязычна: text/author (ru) + textEn/authorEn — getQuoteOfDay(lang)
// отдаёт нужную половину, чтобы на английском UI не проскакивал русский текст.
export const QUOTES = [
  { text: 'Я знаю только то, что ничего не знаю.', author: 'Сократ', textEn: 'I know that I know nothing.', authorEn: 'Socrates' },
  { text: 'Жизнь — это то, что с тобой происходит, пока ты строишь планы.', author: 'Джон Леннон', textEn: 'Life is what happens to you while you’re busy making other plans.', authorEn: 'John Lennon' },
  { text: 'Дорогу осилит идущий.', author: 'Древнеримская пословица', textEn: 'The road is mastered by those who walk it.', authorEn: 'Roman proverb' },
  { text: 'Кто хочет — ищет возможности, кто не хочет — ищет причины.', author: 'Сократ', textEn: 'Those who want to, find a way; those who don’t, find an excuse.', authorEn: 'Socrates' },
  { text: 'Мы есть то, что мы делаем постоянно. Совершенство — не действие, а привычка.', author: 'Аристотель', textEn: 'We are what we repeatedly do. Excellence, then, is not an act but a habit.', authorEn: 'Aristotle' },
  { text: 'Счастье твоей жизни зависит от качества твоих мыслей.', author: 'Марк Аврелий', textEn: 'The happiness of your life depends upon the quality of your thoughts.', authorEn: 'Marcus Aurelius' },
  { text: 'Не в том дело, что с нами происходит, а в том, как мы на это реагируем.', author: 'Эпиктет', textEn: 'It’s not what happens to you, but how you react to it that matters.', authorEn: 'Epictetus' },
  { text: 'Тот, кто имеет «зачем» жить, может вынести почти любое «как».', author: 'Фридрих Ницше', textEn: 'He who has a why to live can bear almost any how.', authorEn: 'Friedrich Nietzsche' },
  { text: 'Падая семь раз, поднимайся восемь.', author: 'Японская пословица', textEn: 'Fall seven times, stand up eight.', authorEn: 'Japanese proverb' },
  { text: 'Лучшее время посадить дерево было двадцать лет назад. Следующее лучшее время — сегодня.', author: 'Китайская пословица', textEn: 'The best time to plant a tree was twenty years ago. The second best time is now.', authorEn: 'Chinese proverb' },
  { text: 'Будь тем изменением, которое ты хочешь видеть в мире.', author: 'Махатма Ганди', textEn: 'Be the change you wish to see in the world.', authorEn: 'Mahatma Gandhi' },
  { text: 'Великие дела не делаются сразу.', author: 'Софокл', textEn: 'Great deeds are not done all at once.', authorEn: 'Sophocles' },
  { text: 'Препятствие на пути становится путём.', author: 'Марк Аврелий', textEn: 'The impediment to action advances action. What stands in the way becomes the way.', authorEn: 'Marcus Aurelius' },
  { text: 'Тяжело в учении — легко в бою.', author: 'Александр Суворов', textEn: 'Hard in training, easy in battle.', authorEn: 'Alexander Suvorov' },
  { text: 'Делай что должно, и будь что будет.', author: 'Марк Аврелий', textEn: 'Do what you must, and let come what may.', authorEn: 'Marcus Aurelius' },
  { text: 'Сила не в том, чтобы никогда не падать, а в том, чтобы вставать после каждого падения.', author: 'Конфуций', textEn: 'Our greatest glory is not in never falling, but in rising every time we fall.', authorEn: 'Confucius' },
  { text: 'Путь в тысячу ли начинается с одного шага.', author: 'Лао-цзы', textEn: 'A journey of a thousand miles begins with a single step.', authorEn: 'Lao Tzu' },
  { text: 'Знание — сила.', author: 'Фрэнсис Бэкон', textEn: 'Knowledge is power.', authorEn: 'Francis Bacon' },
  { text: 'Терпение и труд всё перетрут.', author: 'Русская пословица', textEn: 'Patience and effort wear down any obstacle.', authorEn: 'Russian proverb' },
  { text: 'Кто не рискует, тот не пьёт шампанского.', author: 'Народная мудрость', textEn: 'Nothing ventured, nothing gained.', authorEn: 'Folk wisdom' },
  { text: 'Победи себя — и выиграешь тысячу битв.', author: 'Будда', textEn: 'Conquer yourself and you will win a thousand battles.', authorEn: 'Buddha' },
  { text: 'Ум — не сосуд, который нужно наполнить, а факел, который нужно зажечь.', author: 'Плутарх', textEn: 'The mind is not a vessel to be filled but a fire to be kindled.', authorEn: 'Plutarch' },
  { text: 'Кто двигает гору — начинает с малых камней.', author: 'Конфуций', textEn: 'The man who moves a mountain begins by carrying away small stones.', authorEn: 'Confucius' },
  { text: 'Свобода — это возможность стать лучше.', author: 'Альбер Камю', textEn: 'Freedom is nothing but a chance to be better.', authorEn: 'Albert Camus' },
  { text: 'Человек создан для счастья, как птица для полёта.', author: 'Владимир Короленко', textEn: 'Man is made for happiness as a bird is made for flight.', authorEn: 'Vladimir Korolenko' },
  { text: 'Время, потраченное с удовольствием, не есть потраченное время.', author: 'Бертран Рассел', textEn: 'The time you enjoy wasting is not wasted time.', authorEn: 'Bertrand Russell' },
  { text: 'Тот, кто хочет видеть результаты, должен сначала начать.', author: 'Народная мудрость', textEn: 'Whoever wants results must first begin.', authorEn: 'Folk wisdom' },
  { text: 'Не бойся идти медленно, бойся стоять на месте.', author: 'Китайская пословица', textEn: 'Be not afraid of going slowly; be afraid only of standing still.', authorEn: 'Chinese proverb' },
  { text: 'Самая большая слава — не в том, чтобы никогда не падать, а в том, чтобы подниматься.', author: 'Нельсон Мандела', textEn: 'The greatest glory lies not in never falling, but in rising every time we fall.', authorEn: 'Nelson Mandela' },
  { text: 'Дисциплина — это мост между целью и достижением.', author: 'Джим Рон', textEn: 'Discipline is the bridge between goals and accomplishment.', authorEn: 'Jim Rohn' },
  { text: 'Мы становимся тем, о чём думаем.', author: 'Эрл Найтингейл', textEn: 'We become what we think about.', authorEn: 'Earl Nightingale' },
  { text: 'Хочешь изменить мир — начни с себя.', author: 'Лев Толстой', textEn: 'Everyone thinks of changing the world, but no one thinks of changing himself.', authorEn: 'Leo Tolstoy' },
  { text: 'Здоровье — это ещё не всё, но без него всё — ничто.', author: 'Артур Шопенгауэр', textEn: 'Health is not everything, but without it everything is nothing.', authorEn: 'Arthur Schopenhauer' },
  { text: 'Богат не тот, у кого много, а тот, кому достаточно.', author: 'Сенека', textEn: 'It is not the man who has too little who is poor, but the one who craves more.', authorEn: 'Seneca' },
  { text: 'Жизнь длинна, если умеешь ею пользоваться.', author: 'Сенека', textEn: 'Life is long, if you know how to use it.', authorEn: 'Seneca' },
  { text: 'Лучше зажечь одну маленькую свечу, чем проклинать темноту.', author: 'Конфуций', textEn: 'Better to light one small candle than to curse the darkness.', authorEn: 'Confucius' },
  { text: 'Каждый день, в котором ты не улучшил себя, — потерянный день.', author: 'Народная мудрость', textEn: 'Any day you haven’t improved yourself is a day lost.', authorEn: 'Folk wisdom' },
  { text: 'Воля и труд человека дивные дивы творят.', author: 'Николай Некрасов', textEn: 'Will and labour work wonders.', authorEn: 'Nikolay Nekrasov' },
  { text: 'Кто ясно мыслит, тот ясно излагает.', author: 'Артур Шопенгауэр', textEn: 'Whoever thinks clearly, speaks clearly.', authorEn: 'Arthur Schopenhauer' },
  { text: 'Начни — и дело будет сделано наполовину.', author: 'Гораций', textEn: 'Begin — and the work is half done.', authorEn: 'Horace' },
  { text: 'Спокойствие — это сила.', author: 'Джеймс Аллен', textEn: 'Calmness is power.', authorEn: 'James Allen' },
  { text: 'Действие — основной ключ ко всякому успеху.', author: 'Пабло Пикассо', textEn: 'Action is the foundational key to all success.', authorEn: 'Pablo Picasso' },
  { text: 'Кто владеет собой, тот владеет миром.', author: 'Сенека', textEn: 'Most powerful is he who has himself in his own power.', authorEn: 'Seneca' },
  { text: 'Маленькие шаги каждый день приводят к большим результатам.', author: 'Народная мудрость', textEn: 'Small steps every day lead to big results.', authorEn: 'Folk wisdom' },
  { text: 'Если ты устал — научись отдыхать, а не сдаваться.', author: 'Народная мудрость', textEn: 'If you get tired, learn to rest, not to quit.', authorEn: 'Folk wisdom' },
  { text: 'Великие умы обсуждают идеи, средние — события, мелкие — людей.', author: 'Элеонора Рузвельт', textEn: 'Great minds discuss ideas; average minds discuss events; small minds discuss people.', authorEn: 'Eleanor Roosevelt' },
  { text: 'Сегодня — лучший день, чтобы начать.', author: 'Народная мудрость', textEn: 'Today is the best day to begin.', authorEn: 'Folk wisdom' },
  { text: 'Терпение — спутник мудрости.', author: 'Блаженный Августин', textEn: 'Patience is the companion of wisdom.', authorEn: 'Saint Augustine' }
]

import { mskNow } from './time.js'

// lang: 'en' | 'ru' — по умолчанию русский (обратная совместимость со старыми вызовами)
export function getQuoteOfDay(lang = 'ru') {
  const now = mskNow()
  const start = new Date(now.getFullYear(), 0, 0)
  const dayOfYear = Math.floor((now - start) / 86400000)
  const q = QUOTES[dayOfYear % QUOTES.length]
  return lang === 'en'
    ? { text: q.textEn || q.text, author: q.authorEn || q.author }
    : { text: q.text, author: q.author }
}
