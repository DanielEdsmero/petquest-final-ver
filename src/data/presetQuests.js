export const PRESET_QUESTS = {
  fitness: {
    easy: [
      'Do 20 push-ups',
      'Walk for 15 minutes',
      'Drink 8 glasses of water today',
      'Complete 5 minutes of stretching',
      'Take the stairs instead of the elevator today',
    ],
    medium: [
      'Complete 3 workout sessions this period (30 min each)',
      'Log every meal you eat for all 3 days',
      'Hit 10,000 steps every single day this period',
    ],
    hard: [
      'Run a total of 15km across this week — log each session',
    ],
  },
  academic: {
    easy: [
      'Review yesterday\'s class notes',
      'Read your textbook for 30 minutes',
      'Complete all assigned homework today',
      'Practice flashcards or active recall for 20 minutes',
      'Watch one educational video or lecture today',
    ],
    medium: [
      'Study for a total of 12 hours across the next 3 days',
      'Read a full chapter and write a one-page summary',
      'Complete one major assignment or full problem set',
    ],
    hard: [
      'Study for 40 hours total this week — log your sessions daily',
    ],
  },
}

export const DIFF_META = {
  easy:   { emoji: '🌱', label: 'Easy',   pts: 10, color: '#22c55e', limitDesc: 'Unlimited · Daily quests' },
  medium: { emoji: '⚡', label: 'Medium', pts: 25, color: '#f5a31a', limitDesc: '3 quests per 3-day period' },
  hard:   { emoji: '🔥', label: 'Hard',   pts: 50, color: '#f43f5e', limitDesc: '1 quest per week' },
}
