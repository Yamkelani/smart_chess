/**
 * Unlockable Cosmetics System — Board themes, piece sets, and titles
 * earned through achievements, rating milestones, and gameplay.
 * Persists in localStorage.
 */

const STORAGE_KEY = 'chess3d_cosmetics';

// ── Piece Set Definitions ──
export const PIECE_SETS = {
  classic: {
    id: 'classic',
    name: 'Classic Staunton',
    description: 'The timeless tournament standard.',
    icon: '♔',
    unlockCondition: null, // Always available
  },
  medieval: {
    id: 'medieval',
    name: 'Medieval Kingdom',
    description: 'Ornate castle-themed pieces.',
    icon: '🏰',
    unlockCondition: { type: 'games', count: 25 },
  },
  minimalist: {
    id: 'minimalist',
    name: 'Minimalist',
    description: 'Clean, geometric piece designs.',
    icon: '◆',
    unlockCondition: { type: 'games', count: 10 },
  },
  crystal: {
    id: 'crystal',
    name: 'Crystal',
    description: 'Translucent crystalline pieces that shimmer.',
    icon: '💎',
    unlockCondition: { type: 'rating', value: 1400 },
  },
  flame: {
    id: 'flame',
    name: 'Inferno',
    description: 'Pieces wreathed in fire effects.',
    icon: '🔥',
    unlockCondition: { type: 'streak', count: 5 },
  },
  ice: {
    id: 'ice',
    name: 'Frost',
    description: 'Icy blue pieces with frozen effects.',
    icon: '❄️',
    unlockCondition: { type: 'rating', value: 1600 },
  },
  gold: {
    id: 'gold',
    name: 'Royal Gold',
    description: 'Luxurious gold-plated pieces.',
    icon: '👑',
    unlockCondition: { type: 'rating', value: 2000 },
  },
  neon: {
    id: 'neon',
    name: 'Neon Glow',
    description: 'Cyberpunk-style glowing pieces.',
    icon: '💜',
    unlockCondition: { type: 'achievement', id: 'hundred_games' },
  },
  phantom: {
    id: 'phantom',
    name: 'Phantom',
    description: 'Ethereal, ghostly pieces.',
    icon: '👻',
    unlockCondition: { type: 'puzzles', count: 30 },
  },
  champion: {
    id: 'champion',
    name: 'Champion',
    description: 'The ultimate piece set for masters.',
    icon: '🏆',
    unlockCondition: { type: 'achievement', id: 'beat_master' },
  },
};

// ── Board Theme Unlocks ──
export const BOARD_UNLOCKS = {
  classic: { unlockCondition: null },
  midnight: { unlockCondition: null },
  neon: { unlockCondition: { type: 'games', count: 5 } },
  marble: { unlockCondition: { type: 'games', count: 15 } },
  rosewood: { unlockCondition: { type: 'rating', value: 1300 } },
  glass: { unlockCondition: { type: 'rating', value: 1500 } },
  obsidian: { unlockCondition: { type: 'rating', value: 1800 } },
  galaxy: { unlockCondition: { type: 'rating', value: 2000 } },
  emerald: { unlockCondition: { type: 'streak', count: 7 } },
  lava: { unlockCondition: { type: 'achievement', id: 'win_streak_10' } },
};

// ── Title Unlocks ──
export const TITLES = {
  newcomer: { name: 'Newcomer', icon: '🌱', condition: null },
  apprentice: { name: 'Apprentice', icon: '📖', condition: { type: 'games', count: 10 } },
  tactician: { name: 'Tactician', icon: '⚔️', condition: { type: 'puzzles', count: 20 } },
  strategist: { name: 'Strategist', icon: '🧠', condition: { type: 'rating', value: 1400 } },
  veteran: { name: 'Veteran', icon: '🎖️', condition: { type: 'games', count: 100 } },
  champion: { name: 'Champion', icon: '🏆', condition: { type: 'rating', value: 1800 } },
  legend: { name: 'Legend', icon: '⭐', condition: { type: 'rating', value: 2200 } },
};

// ── Board Backgrounds ──
export const BOARD_BACKGROUNDS = {
  default: { name: 'Default', preview: '#08081a', unlockCondition: null },
  starfield: { name: 'Starfield', preview: '#0a0a2e', unlockCondition: { type: 'games', count: 20 } },
  forest: { name: 'Dark Forest', preview: '#0a1a0a', unlockCondition: { type: 'games', count: 40 } },
  ocean: { name: 'Deep Ocean', preview: '#0a1a2e', unlockCondition: { type: 'rating', value: 1500 } },
  sunset: { name: 'Sunset', preview: '#2e1a0a', unlockCondition: { type: 'streak', count: 3 } },
  aurora: { name: 'Aurora', preview: '#0a2e2e', unlockCondition: { type: 'rating', value: 1700 } },
};

// ── State Management ──

function _load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignore */ }
  return {
    activePieceSet: 'classic',
    activeTitle: 'newcomer',
    activeBackground: 'default',
    unlockedPieceSets: ['classic'],
    unlockedBoards: ['classic', 'midnight'],
    unlockedTitles: ['newcomer'],
    unlockedBackgrounds: ['default'],
    xp: 0,
    level: 1,
  };
}

function _save(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
}

/**
 * Check what the player has unlocked based on their stats
 */
export function refreshUnlocks(stats) {
  const data = _load();
  const { rating = 1200, games = 0, streak = 0, puzzlesSolved = 0, achievements = [] } = stats;
  let newUnlocks = [];

  // Check piece sets
  for (const [id, set] of Object.entries(PIECE_SETS)) {
    if (data.unlockedPieceSets.includes(id)) continue;
    if (!set.unlockCondition) continue;
    if (_checkCondition(set.unlockCondition, stats)) {
      data.unlockedPieceSets.push(id);
      newUnlocks.push({ type: 'piece_set', id, name: set.name, icon: set.icon });
    }
  }

  // Check board themes
  for (const [id, board] of Object.entries(BOARD_UNLOCKS)) {
    if (data.unlockedBoards.includes(id)) continue;
    if (!board.unlockCondition) continue;
    if (_checkCondition(board.unlockCondition, stats)) {
      data.unlockedBoards.push(id);
      newUnlocks.push({ type: 'board_theme', id, name: id });
    }
  }

  // Check titles
  for (const [id, title] of Object.entries(TITLES)) {
    if (data.unlockedTitles.includes(id)) continue;
    if (!title.condition) continue;
    if (_checkCondition(title.condition, stats)) {
      data.unlockedTitles.push(id);
      newUnlocks.push({ type: 'title', id, name: title.name, icon: title.icon });
    }
  }

  // Check backgrounds
  for (const [id, bg] of Object.entries(BOARD_BACKGROUNDS)) {
    if (data.unlockedBackgrounds.includes(id)) continue;
    if (!bg.unlockCondition) continue;
    if (_checkCondition(bg.unlockCondition, stats)) {
      data.unlockedBackgrounds.push(id);
      newUnlocks.push({ type: 'background', id, name: bg.name });
    }
  }

  _save(data);
  return newUnlocks;
}

function _checkCondition(cond, stats) {
  switch (cond.type) {
    case 'games': return (stats.games || 0) >= cond.count;
    case 'rating': return (stats.rating || 1200) >= cond.value;
    case 'streak': return (stats.streak || 0) >= cond.count;
    case 'puzzles': return (stats.puzzlesSolved || 0) >= cond.count;
    case 'achievement': return (stats.achievements || []).includes(cond.id);
    default: return false;
  }
}

// ── XP & Level System ──

const XP_PER_LEVEL = 100;
const XP_REWARDS = {
  game_played: 10,
  game_won: 25,
  puzzle_solved: 15,
  daily_puzzle: 30,
  achievement: 50,
  lesson_completed: 20,
  streak_day: 10,
};

export function addXP(reason) {
  const data = _load();
  const xpAmount = XP_REWARDS[reason] || 0;
  data.xp += xpAmount;

  // Level up
  const newLevel = Math.floor(data.xp / XP_PER_LEVEL) + 1;
  const leveledUp = newLevel > data.level;
  data.level = newLevel;

  _save(data);
  return { xpGained: xpAmount, totalXP: data.xp, level: data.level, leveledUp };
}

export function getXPState() {
  const data = _load();
  return {
    xp: data.xp,
    level: data.level,
    xpInLevel: data.xp % XP_PER_LEVEL,
    xpToNextLevel: XP_PER_LEVEL,
    progress: (data.xp % XP_PER_LEVEL) / XP_PER_LEVEL,
  };
}

// ── Active Cosmetic Getters/Setters ──

export function getActivePieceSet() { return _load().activePieceSet; }
export function setActivePieceSet(id) {
  const data = _load();
  if (data.unlockedPieceSets.includes(id)) { data.activePieceSet = id; _save(data); return true; }
  return false;
}

export function getActiveTitle() {
  const data = _load();
  return TITLES[data.activeTitle] || TITLES.newcomer;
}
export function setActiveTitle(id) {
  const data = _load();
  if (data.unlockedTitles.includes(id)) { data.activeTitle = id; _save(data); return true; }
  return false;
}

export function getActiveBackground() { return _load().activeBackground; }
export function setActiveBackground(id) {
  const data = _load();
  if (data.unlockedBackgrounds.includes(id)) { data.activeBackground = id; _save(data); return true; }
  return false;
}

export function getUnlockedPieceSets() { return _load().unlockedPieceSets; }
export function getUnlockedBoards() { return _load().unlockedBoards; }
export function getUnlockedTitles() { return _load().unlockedTitles; }
export function getUnlockedBackgrounds() { return _load().unlockedBackgrounds; }

export function getCosmeticsState() { return _load(); }
