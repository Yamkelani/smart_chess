/**
 * Achievement System — Track chess milestones and award badges
 * Persists in localStorage.
 */

const STORAGE_KEY = 'chess3d_achievements';

// Achievement definitions
export const ACHIEVEMENTS = {
  first_win: {
    id: 'first_win',
    title: 'First Victory',
    desc: 'Win your first game against the AI',
    icon: '🏆',
    category: 'milestones',
  },
  first_checkmate: {
    id: 'first_checkmate',
    title: 'Checkmate!',
    desc: 'Deliver your first checkmate',
    icon: '♚',
    category: 'milestones',
  },
  ten_games: {
    id: 'ten_games',
    title: 'Getting Started',
    desc: 'Play 10 games',
    icon: '🎮',
    category: 'milestones',
  },
  fifty_games: {
    id: 'fifty_games',
    title: 'Dedicated Player',
    desc: 'Play 50 games',
    icon: '🎯',
    category: 'milestones',
  },
  hundred_games: {
    id: 'hundred_games',
    title: 'Chess Enthusiast',
    desc: 'Play 100 games',
    icon: '💎',
    category: 'milestones',
  },
  win_streak_3: {
    id: 'win_streak_3',
    title: 'Hot Streak',
    desc: 'Win 3 games in a row',
    icon: '🔥',
    category: 'streaks',
  },
  win_streak_5: {
    id: 'win_streak_5',
    title: 'Unstoppable',
    desc: 'Win 5 games in a row',
    icon: '⚡',
    category: 'streaks',
  },
  win_streak_10: {
    id: 'win_streak_10',
    title: 'Legendary',
    desc: 'Win 10 games in a row',
    icon: '👑',
    category: 'streaks',
  },
  beat_advanced: {
    id: 'beat_advanced',
    title: 'Rising Star',
    desc: 'Beat the AI on Advanced difficulty',
    icon: '⭐',
    category: 'difficulty',
  },
  beat_expert: {
    id: 'beat_expert',
    title: 'Chess Warrior',
    desc: 'Beat the AI on Expert difficulty',
    icon: '🗡️',
    category: 'difficulty',
  },
  beat_master: {
    id: 'beat_master',
    title: 'Grandmaster Slayer',
    desc: 'Beat the AI on Master difficulty',
    icon: '🏅',
    category: 'difficulty',
  },
  quick_win: {
    id: 'quick_win',
    title: 'Speed Demon',
    desc: 'Win a game in under 20 moves',
    icon: '⏱️',
    category: 'special',
  },
  long_game: {
    id: 'long_game',
    title: 'Marathon',
    desc: 'Play a game lasting 60+ moves',
    icon: '🏃',
    category: 'special',
  },
  scholar_mate: {
    id: 'scholar_mate',
    title: 'Scholar\'s Mate',
    desc: 'Win in 4 moves or fewer',
    icon: '🎓',
    category: 'special',
  },
  promotion: {
    id: 'promotion',
    title: 'Promoted!',
    desc: 'Promote a pawn to a queen',
    icon: '♕',
    category: 'special',
  },
  rating_1400: {
    id: 'rating_1400',
    title: 'Club Player',
    desc: 'Reach a rating of 1400',
    icon: '♞',
    category: 'rating',
  },
  rating_1600: {
    id: 'rating_1600',
    title: 'Advanced Player',
    desc: 'Reach a rating of 1600',
    icon: '🎯',
    category: 'rating',
  },
  rating_1800: {
    id: 'rating_1800',
    title: 'Expert Player',
    desc: 'Reach a rating of 1800',
    icon: '🏆',
    category: 'rating',
  },
  rating_2000: {
    id: 'rating_2000',
    title: 'Master Class',
    desc: 'Reach a rating of 2000',
    icon: '⭐',
    category: 'rating',
  },
  use_hint: {
    id: 'use_hint',
    title: 'Student',
    desc: 'Use the hint system for the first time',
    icon: '💡',
    category: 'learning',
  },
  complete_lesson: {
    id: 'complete_lesson',
    title: 'Scholar',
    desc: 'Complete a lesson in the Learn tab',
    icon: '📚',
    category: 'learning',
  },
  ask_coach: {
    id: 'ask_coach',
    title: 'Curious Mind',
    desc: 'Ask the AI coach a question',
    icon: '🧠',
    category: 'learning',
  },
};

function _load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignore */ }
  return { unlocked: {}, stats: { games: 0, wins: 0, winStreak: 0, bestStreak: 0 } };
}

function _save(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) { /* ignore */ }
}

/**
 * Check and potentially unlock achievements based on game result.
 * @param {object} context - { result, difficulty, moveCount, rating, hadPromotion }
 * @returns {Array} newly unlocked achievements
 */
export function checkAchievements(context) {
  const data = _load();
  const newlyUnlocked = [];

  function unlock(id) {
    if (!data.unlocked[id]) {
      data.unlocked[id] = Date.now();
      newlyUnlocked.push(ACHIEVEMENTS[id]);
    }
  }

  // Update stats
  if (context.gameCompleted) {
    data.stats.games = (data.stats.games || 0) + 1;

    if (context.result === 'win') {
      data.stats.wins = (data.stats.wins || 0) + 1;
      data.stats.winStreak = (data.stats.winStreak || 0) + 1;
      if (data.stats.winStreak > (data.stats.bestStreak || 0)) {
        data.stats.bestStreak = data.stats.winStreak;
      }
    } else {
      data.stats.winStreak = 0;
    }
  }

  // ── Milestone achievements ──
  if (context.result === 'win') {
    unlock('first_win');
  }
  if (context.isCheckmate && context.result === 'win') {
    unlock('first_checkmate');
  }
  if (data.stats.games >= 10) unlock('ten_games');
  if (data.stats.games >= 50) unlock('fifty_games');
  if (data.stats.games >= 100) unlock('hundred_games');

  // ── Streak achievements ──
  if (data.stats.winStreak >= 3) unlock('win_streak_3');
  if (data.stats.winStreak >= 5) unlock('win_streak_5');
  if (data.stats.winStreak >= 10) unlock('win_streak_10');

  // ── Difficulty achievements ──
  if (context.result === 'win') {
    if (context.difficulty === 'advanced') unlock('beat_advanced');
    if (context.difficulty === 'expert') unlock('beat_expert');
    if (context.difficulty === 'master') unlock('beat_master');
  }

  // ── Special achievements ──
  if (context.result === 'win' && context.moveCount && context.moveCount < 20) {
    unlock('quick_win');
  }
  if (context.moveCount && context.moveCount >= 60) {
    unlock('long_game');
  }
  if (context.result === 'win' && context.moveCount && context.moveCount <= 4) {
    unlock('scholar_mate');
  }
  if (context.hadPromotion) {
    unlock('promotion');
  }

  // ── Rating achievements ──
  if (context.rating) {
    if (context.rating >= 1400) unlock('rating_1400');
    if (context.rating >= 1600) unlock('rating_1600');
    if (context.rating >= 1800) unlock('rating_1800');
    if (context.rating >= 2000) unlock('rating_2000');
  }

  // ── Learning achievements ──
  if (context.usedHint) unlock('use_hint');
  if (context.completedLesson) unlock('complete_lesson');
  if (context.askedCoach) unlock('ask_coach');

  _save(data);
  return newlyUnlocked;
}

/**
 * Get all achievements with unlock status
 */
export function getAllAchievements() {
  const data = _load();
  return Object.values(ACHIEVEMENTS).map(a => ({
    ...a,
    unlocked: !!data.unlocked[a.id],
    unlockedAt: data.unlocked[a.id] || null,
  }));
}

/**
 * Get unlocked achievement count
 */
export function getUnlockedCount() {
  const data = _load();
  return Object.keys(data.unlocked).length;
}

/**
 * Get total achievement count
 */
export function getTotalCount() {
  return Object.keys(ACHIEVEMENTS).length;
}

/**
 * Get achievement stats
 */
export function getStats() {
  return _load().stats;
}

/**
 * Manually trigger a single non-game achievement (e.g., hint, lesson)
 */
export function triggerAchievement(id) {
  const data = _load();
  if (!data.unlocked[id] && ACHIEVEMENTS[id]) {
    data.unlocked[id] = Date.now();
    _save(data);
    return ACHIEVEMENTS[id];
  }
  return null;
}

/**
 * Reset all achievements
 */
export function resetAchievements() {
  _save({ unlocked: {}, stats: { games: 0, wins: 0, winStreak: 0, bestStreak: 0 } });
}
