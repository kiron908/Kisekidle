import "./styles.css";
import { useState, useEffect, useRef } from "react";
import Confetti from "react-confetti";
import {
  CHARACTERS,
  QUOTES,
  MUSIC,
  LOCATIONS,
  TRIVIA,
  CRAFTS,
  SILHOUETTES,
} from "./data";

import { doc, setDoc, getDoc, increment } from "firebase/firestore";
import { db } from "./firebase";
import GlobalStatsModal from "./GlobalStatsModal";

const GAME_ORDER = [
  "FC",
  "SC",
  "3rd",
  "Zero",
  "Azure",
  "CS1",
  "CS2",
  "CS3",
  "CS4",
  "Reverie",
  "Daybreak",
  "Daybreak 2",
];

// --- Date Helpers ---
const getDateString = (dateObj) => {
  return `${dateObj.getUTCFullYear()}-${
    dateObj.getUTCMonth() + 1
  }-${dateObj.getUTCDate()}`;
};

const getTodayString = () => getDateString(new Date());

const getDailyItem = (dataArray, targetDateObj = new Date()) => {
  if (!dataArray || dataArray.length === 0) return {}; // Safeguard
  const epochDate = new Date("2024-01-01T00:00:00Z");

  const targetUTC = Date.UTC(
    targetDateObj.getUTCFullYear(),
    targetDateObj.getUTCMonth(),
    targetDateObj.getUTCDate()
  );

  const diffDays = Math.floor(
    (targetUTC - epochDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  // --- NEW RANDOMIZATION LOGIC ---
  // We use the diffDays as a "seed" for a pseudo-random number generator.
  // We add an arbitrary number (like 12345) just to shift the starting point.
  const seed = diffDays + 12345;

  // Math.sin(seed) generates a crazy decimal. We multiply it by a large number,
  // take the absolute value, and then use modulo to fit it to your array length!
  const pseudoRandomNumber = Math.abs(Math.sin(seed) * 10000);
  const randomIndex = Math.floor(pseudoRandomNumber) % dataArray.length;

  return dataArray[randomIndex];
};

// --- Local Storage Hook ---
function useDailyLocalStorage(baseKey, targetDateStr) {
  const isToday = targetDateStr === getTodayString();
  const storageKey = isToday ? baseKey : `${baseKey}-${targetDateStr}`;

  const [value, setValue] = useState(() => {
    const storedData = localStorage.getItem(storageKey);
    if (storedData) {
      const parsedData = JSON.parse(storedData);
      if (parsedData.date === targetDateStr) {
        return parsedData.guesses;
      }
    }
    return [];
  });

  useEffect(() => {
    const dataToSave = { date: targetDateStr, guesses: value };
    localStorage.setItem(storageKey, JSON.stringify(dataToSave));
  }, [value, storageKey, targetDateStr]);

  return [value, setValue];
}

// --- Custom Hook for Permanent Local Storage ---
function usePersistentStorage(storageKey, initialValue) {
  const [value, setValue] = useState(() => {
    const storedData = localStorage.getItem(storageKey);
    return storedData ? JSON.parse(storedData) : initialValue;
  });

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(value));
  }, [value, storageKey]);

  return [value, setValue];
}

// --- Helper Function to Update Stats ---
const updateGameStats = (mode, hasWon, guessesUsed, maxGuesses) => {
  const statsStr = localStorage.getItem("kisekidle-stats");

  let stats = statsStr
    ? JSON.parse(statsStr)
    : {
        overall: {
          games: 0,
          wins: 0,
          winRate: "0%",
          daysActive: 0,
          streak: 0,
          perfectGames: 0,
        },
        character: {
          played: 0,
          won: 0,
          winRate: "0%",
          avgGuesses: 0,
          currentStreak: 0,
          bestStreak: 0,
          firstTryWins: 0,
          closeCalls: 0,
        },
        quote: {
          played: 0,
          won: 0,
          winRate: "0%",
          avgGuesses: 0,
          currentStreak: 0,
          bestStreak: 0,
          firstTryWins: 0,
          closeCalls: 0,
        },
        music: {
          played: 0,
          won: 0,
          winRate: "0%",
          avgGuesses: 0,
          currentStreak: 0,
          bestStreak: 0,
          firstTryWins: 0,
          closeCalls: 0,
        },
        location: {
          played: 0,
          won: 0,
          winRate: "0%",
          avgGuesses: 0,
          currentStreak: 0,
          bestStreak: 0,
          firstTryWins: 0,
          closeCalls: 0,
        },
      };

  // SAFEGUARD: Initialize new modes if they don't exist yet
  const newModes = ["trivia", "crafts", "silhouette"];
  newModes.forEach((m) => {
    if (!stats[m]) {
      stats[m] = {
        played: 0,
        won: 0,
        winRate: "0%",
        avgGuesses: 0,
        currentStreak: 0,
        bestStreak: 0,
        firstTryWins: 0,
        closeCalls: 0,
      };
    }
  });

  let modeStats = stats[mode];
  modeStats.played += 1;

  if (hasWon) {
    const totalPreviousGuesses =
      parseFloat(modeStats.avgGuesses) * modeStats.won || 0;
    modeStats.won += 1;
    modeStats.avgGuesses = (
      (totalPreviousGuesses + guessesUsed) /
      modeStats.won
    ).toFixed(1);

    modeStats.currentStreak += 1;
    if (modeStats.currentStreak > modeStats.bestStreak)
      modeStats.bestStreak = modeStats.currentStreak;

    if (guessesUsed === 1) modeStats.firstTryWins += 1;
    if (guessesUsed === maxGuesses) modeStats.closeCalls += 1;
  } else {
    modeStats.currentStreak = 0;
  }

  modeStats.winRate =
    Math.round((modeStats.won / modeStats.played) * 100) + "%";

  stats.overall.games += 1;
  if (hasWon) stats.overall.wins += 1;
  stats.overall.winRate =
    Math.round((stats.overall.wins / stats.overall.games) * 100) + "%";

  localStorage.setItem("kisekidle-stats", JSON.stringify(stats));
};

// ==========================================
// 1. COUNTDOWN TIMER COMPONENT
// ==========================================
function CountdownTimer() {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date();
      const tomorrow = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
      );
      const difference = tomorrow - now;

      if (difference <= 0) {
        window.location.reload();
        return "00h 00m 00s";
      }

      const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((difference / 1000 / 60) % 60);
      const seconds = Math.floor((difference / 1000) % 60);

      return `${hours.toString().padStart(2, "0")}h ${minutes
        .toString()
        .padStart(2, "0")}m ${seconds.toString().padStart(2, "0")}s`;
    };

    setTimeLeft(calculateTimeLeft());
    const timer = setInterval(() => setTimeLeft(calculateTimeLeft()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="sidebar-countdown">
      <div>Next puzzle:</div>
      <div className="countdown-time">{timeLeft}</div>
    </div>
  );
}

// ==========================================
// 2. CHARACTER MODE COMPONENT
// ==========================================
function CharacterMode({
  version,
  targetDateObj,
  targetDateStr,
  isArchive,
  setIsModalOpen,
}) {
  const [currentGuess, setCurrentGuess] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [storedGuesses, setGuessedCharacters] = useDailyLocalStorage(
    "kisekidle-chars",
    targetDateStr
  );
  const guessedCharacters = storedGuesses || [];
  const [collection, setCollection] = usePersistentStorage(
    "kisekidle-collection",
    []
  );
  const [isCopied, setIsCopied] = useState(false);
  const [targetCharacter] = useState(getDailyItem(CHARACTERS, targetDateObj));

  const MAX_GUESSES = 10;
  const hasWon = guessedCharacters.some(
    (char) => char.id === targetCharacter.id
  );
  const guessesLeft = MAX_GUESSES - guessedCharacters.length;
  const isGameOver = guessesLeft <= 0 && !hasWon;

  const [globalStats, setGlobalStats] = useState(null);

  const handleInputChange = (e) => {
    const value = e.target.value;
    setCurrentGuess(value);
    if (value.length > 0) {
      const filteredChars = CHARACTERS.filter((char) =>
        char.name.toLowerCase().includes(value.toLowerCase())
      );
      setSuggestions(filteredChars);
    } else {
      setSuggestions([]);
    }
  };

  // Start it as true ONLY if they already won previously (so archived games load instantly)
  const [showEndScreen, setShowEndScreen] = useState(hasWon || isGameOver);

  // When a win or loss happens, start a 1.8 second timer before showing the screen
  useEffect(() => {
    if (hasWon || isGameOver) {
      const timer = setTimeout(() => {
        setShowEndScreen(true);
      }, 3800);
      return () => clearTimeout(timer);
    }
  }, [hasWon, isGameOver]);

  // --- GLOBAL STATS TRACKING ---
  useEffect(() => {
    // Only run this when the end screen is ready to show, and only run it once!
    if (showEndScreen && !globalStats) {
      const updateAndFetchStats = async () => {
        try {
          // 1. Point to today's specific document in the database
          const statsRef = doc(db, "character_stats", targetDateStr);

          // 2. Safely add +1 to today's stats.
          // (merge: true ensures it creates the document if it's the first play of the day!)
          // Grab the name of their most recent guess to log it!
          const lastGuessName =
            guesses.length > 0
              ? guesses[guessedCharacters.length - 1].name
              : "Unknown";

          await setDoc(
            statsRef,
            {
              totalPlays: increment(1),
              totalWins: hasWon ? increment(1) : increment(0),
              // Track total winning attempts to calculate the average later!
              totalWinningAttempts: hasWon
                ? increment(guessedCharacters.length)
                : increment(0),
              // Keep a tally of every specific character guessed
              [`guessTally.${lastGuessName}`]: increment(1),
            },
            { merge: true }
          );

          // 3. Immediately pull the updated numbers back down to show the player
          const updatedDoc = await getDoc(statsRef);
          if (updatedDoc.exists()) {
            setGlobalStats(updatedDoc.data());
          }
        } catch (error) {
          console.error("Error saving stats to Firebase:", error);
        }
      };

      updateAndFetchStats();
    }
  }, [
    showEndScreen,
    hasWon,
    guessedCharacters.length,
    targetDateStr,
    globalStats,
  ]);

  const handleGuess = (selectedChar) => {
    if (guessedCharacters.find((c) => c.id === selectedChar.id)) return;

    const newGuesses = [...guessedCharacters, selectedChar];
    const isWin = selectedChar.id === targetCharacter.id;
    const isLoss = newGuesses.length >= MAX_GUESSES && !isWin;

    if (isWin && !collection.includes(selectedChar.id)) {
      setCollection([...collection, selectedChar.id]);
    }

    if (!isArchive && (isWin || isLoss)) {
      updateGameStats("character", isWin, newGuesses.length, MAX_GUESSES);
    }

    setGuessedCharacters(newGuesses);
    setCurrentGuess("");
    setSuggestions([]);
  };

  const getMatchColor = (guessVal, targetVal) => {
    if (JSON.stringify(guessVal) === JSON.stringify(targetVal))
      return "#4CAF50";
    const guessArr = Array.isArray(guessVal) ? guessVal : [guessVal];
    const targetArr = Array.isArray(targetVal) ? targetVal : [targetVal];
    if (guessArr.some((item) => targetArr.includes(item))) return "#FF9800";
    return "#F44336";
  };

  const formatTrait = (trait) =>
    Array.isArray(trait) ? trait.join(", ") : trait;

  const getAgeArrow = (guessAge, targetAge) => {
    const gAge = parseInt(guessAge);
    const tAge = parseInt(targetAge);
    if (isNaN(gAge) || isNaN(tAge) || gAge === tAge) return null;
    const arrow = gAge < tAge ? "↑" : "↓";
    return <span className="hint-arrow">{arrow}</span>;
  };

  const getGameArrow = (guessGame, targetGame) => {
    const gIndex = GAME_ORDER.indexOf(guessGame);
    const tIndex = GAME_ORDER.indexOf(targetGame);
    if (gIndex === -1 || tIndex === -1 || gIndex === tIndex) return null;
    const arrow = gIndex < tIndex ? "↑" : "↓";
    return <span className="hint-arrow">{arrow}</span>;
  };

  const handleShare = () => {
    let shareText = `Kisekidle - Character\n`;
    const score = hasWon ? guessedCharacters.length : "X";
    shareText += `Guesses: ${score}/${MAX_GUESSES}\n\n`;

    guessedCharacters.forEach((char) => {
      const traits = [
        getMatchColor(char.gender, targetCharacter.gender),
        getMatchColor(char.weapon, targetCharacter.weapon),
        getMatchColor(char.nationality, targetCharacter.nationality),
        getMatchColor(char.affiliation, targetCharacter.affiliation),
        getMatchColor(char.age, targetCharacter.age),
        getMatchColor(char.debutGame, targetCharacter.debutGame),
      ];

      const rowEmojis = traits
        .map((color) => {
          if (color === "#4CAF50") return "🟩";
          if (color === "#FF9800") return "🟧";
          return "🟥";
        })
        .join("");

      shareText += rowEmojis + "\n";
    });

    navigator.clipboard.writeText(shareText).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  };

  return (
    <div style={{ width: "100%" }}>
      <div className="header-container">
        <h2 className="mode-title">Guess the Character</h2>
        <div className="guesses-remaining">
          Guesses Remaining: {guessesLeft}
        </div>
      </div>

      {hasWon && showEndScreen && (
        <div className="victory-box">
          <Confetti
            width={window.innerWidth}
            height={window.innerHeight}
            recycle={false}
            numberOfPieces={400}
            gravity={0.15}
          />
          <h3>🎉 You got it! 🎉</h3>
          <p>
            The character was <strong>{targetCharacter.name}</strong>.
          </p>

          <button
            onClick={() => setIsModalOpen(true)}
            style={{
              padding: "10px",
              margin: "15px 0",
              backgroundColor: "#4a90e2",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              width: "100%",
            }}
          >
            📊 View Global Stats
          </button>

          <button className="share-button" onClick={handleShare}>
            {isCopied ? "📋 Copied to Clipboard!" : "📤 Share Results"}
          </button>
        </div>
      )}

      {isGameOver && showEndScreen && (
        <div className="game-over-box">
          <h3>❌ Out of guesses! ❌</h3>
          <p>
            The correct character was <strong>{targetCharacter.name}</strong>.
          </p>
          <button className="share-button" onClick={handleShare}>
            {isCopied ? "📋 Copied to Clipboard!" : "📤 Share Results"}
          </button>
        </div>
      )}
      {!showEndScreen && (
        <div className="search-container">
          <input
            type="text"
            className="search-input"
            value={currentGuess}
            onChange={handleInputChange}
            placeholder="Search for a character..."
            disabled={hasWon || isGameOver}
          />
          <button
            className="submit-button"
            disabled={hasWon || isGameOver}
            onClick={() =>
              suggestions.length > 0 && handleGuess(suggestions[0])
            }
          >
            Submit Guess
          </button>
          {suggestions.length > 0 && (
            <ul className="suggestions-list">
              {suggestions.map((c) => (
                <li key={c.id} onClick={() => handleGuess(c)}>
                  {c.name}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="grid-container">
        {guessedCharacters.length > 0 && (
          <div className="grid-header">
            <div>Character</div>
            <div>Gender</div>
            <div>Weapon</div>
            <div>Nation</div>
            <div>Affiliation</div>
            <div>Age</div>
            <div>Debut</div>
          </div>
        )}
        {guessedCharacters
          .slice()
          .reverse()
          .map((char) => (
            <div key={char.id} className="grid-row">
              {/* Name - Flips immediately */}
              <div
                className="grid-cell reveal-cell"
                style={{ animationDelay: "0s" }}
              >
                {char.name}
              </div>

              {/* Gender - 0.5s delay */}
              <div
                className="grid-cell reveal-cell"
                style={{
                  backgroundColor: getMatchColor(
                    char.gender,
                    targetCharacter.gender
                  ),
                  animationDelay: "1s",
                }}
              >
                {formatTrait(char.gender)}
              </div>

              {/* Weapon - 0.6s delay */}
              <div
                className="grid-cell reveal-cell"
                style={{
                  backgroundColor: getMatchColor(
                    char.weapon,
                    targetCharacter.weapon
                  ),
                  animationDelay: "1.5s",
                }}
              >
                {formatTrait(char.weapon)}
              </div>

              {/* Nation - 0.8s delay */}
              <div
                className="grid-cell reveal-cell"
                style={{
                  backgroundColor: getMatchColor(
                    char.nationality,
                    targetCharacter.nationality
                  ),
                  animationDelay: "2s",
                }}
              >
                {formatTrait(char.nationality)}
              </div>

              {/* Affiliation - 1s delay */}
              <div
                className="grid-cell reveal-cell"
                style={{
                  backgroundColor: getMatchColor(
                    char.affiliation,
                    targetCharacter.affiliation
                  ),
                  animationDelay: "2.5s",
                }}
              >
                {formatTrait(char.affiliation)}
              </div>

              {/* Age - 1.2s delay */}
              <div
                className="grid-cell reveal-cell"
                style={{
                  backgroundColor: getMatchColor(char.age, targetCharacter.age),
                  animationDelay: "3s",
                }}
              >
                {char.age} {getAgeArrow(char.age, targetCharacter.age)}
              </div>

              {/* Debut - 1.4s delay */}
              <div
                className="grid-cell reveal-cell"
                style={{
                  backgroundColor: getMatchColor(
                    char.debutGame,
                    targetCharacter.debutGame
                  ),
                  animationDelay: "3.5s",
                }}
              >
                {char.debutGame}{" "}
                {getGameArrow(char.debutGame, targetCharacter.debutGame)}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

// ==========================================
// 3. QUOTE MODE COMPONENT
// ==========================================
function QuoteMode({
  version,
  targetDateObj,
  targetDateStr,
  isArchive,
  setIsModalOpen,
}) {
  const [currentGuess, setCurrentGuess] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [storedGuesses, setGuessedCharacters] = useDailyLocalStorage(
    "kisekidle-quotes",
    targetDateStr
  );
  const guessedCharacters = storedGuesses || [];
  const [isCopied, setIsCopied] = useState(false);

  const [targetQuote] = useState(getDailyItem(QUOTES, targetDateObj));

  const MAX_GUESSES = 6;
  const wrongGuessesCount = guessedCharacters.filter(
    (char) => char.name !== targetQuote.character
  ).length;
  const hasWon = guessedCharacters.some(
    (char) => char.name === targetQuote.character
  );
  const guessesLeft = MAX_GUESSES - guessedCharacters.length;
  const isGameOver = guessesLeft <= 0 && !hasWon;

  const [isGameRevealed, setIsGameRevealed] = useState(false);
  const [isRecipientRevealed, setIsRecipientRevealed] = useState(false);

  const guessesNeededForGame = Math.max(0, 3 - wrongGuessesCount);
  const guessesNeededForRecipient = Math.max(0, 4 - wrongGuessesCount);

  const handleInputChange = (e) => {
    const value = e.target.value;
    setCurrentGuess(value);
    if (value.length > 0) {
      const filteredChars = CHARACTERS.filter((char) =>
        char.name.toLowerCase().includes(value.toLowerCase())
      );
      setSuggestions(filteredChars);
    } else {
      setSuggestions([]);
    }
  };

  const handleGuess = (selectedChar) => {
    if (hasWon || isGameOver) return;
    if (guessedCharacters.find((c) => c.name === selectedChar.name)) return;

    const newGuesses = [...guessedCharacters, selectedChar];
    const isWin = selectedChar.name === targetQuote.character;
    const isLoss = newGuesses.length >= MAX_GUESSES && !isWin;

    if (!isArchive && (isWin || isLoss)) {
      updateGameStats("quote", isWin, newGuesses.length, MAX_GUESSES);
    }
    setGuessedCharacters(newGuesses);
    setCurrentGuess("");
    setSuggestions([]);
  };

  const handleShare = () => {
    const score = hasWon ? guessedCharacters.length : "X";
    let shareText = `Kisekidle - Quote\nGuesses: ${score}/${MAX_GUESSES}\n\n`;
    const emojis = guessedCharacters
      .map((char) => (char.name === targetQuote.character ? "🟩" : "🟥"))
      .join("");
    shareText += emojis;
    navigator.clipboard.writeText(shareText).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  };

  return (
    <div style={{ maxWidth: "600px", margin: "0 auto", width: "100%" }}>
      <div className="header-container">
        <h2 className="mode-title">Who said it?</h2>
      </div>

      <div className="quote-box">"{targetQuote.quote}"</div>
      <div
        style={{
          textAlign: "center",
          marginBottom: "20px",
          fontWeight: "bold",
        }}
      >
        Guesses Remaining: {guessesLeft}
      </div>

      {hasWon && (
        <div className="victory-box">
          <Confetti
            width={window.innerWidth}
            height={window.innerHeight}
            recycle={false}
            numberOfPieces={400}
            gravity={0.15}
          />
          <h3>🎉 You got it! 🎉</h3>
          <p>
            The character was <strong>{targetQuote.character}</strong>.
          </p>
          <button className="share-button" onClick={handleShare}>
            {isCopied ? "📋 Copied to Clipboard!" : "📤 Share Results"}
          </button>
        </div>
      )}

      {isGameOver && (
        <div className="game-over-box">
          <h3>❌ Out of guesses! ❌</h3>
          <p>
            The correct character was <strong>{targetQuote.character}</strong>.
          </p>
          <button className="share-button" onClick={handleShare}>
            {isCopied ? "📋 Copied to Clipboard!" : "📤 Share Results"}
          </button>
        </div>
      )}

      <div className="hints-container">
        {/* --- HINT 1: REVEAL GAME --- */}
        <div className="hint-wrapper" style={{ margin: "0 auto" }}>
          <button
            className={`hint-btn ${
              isGameRevealed || hasWon || isGameOver
                ? "revealed"
                : guessesNeededForGame <= 0
                ? "unlocked"
                : "locked"
            }`}
            onClick={() => guessesNeededForGame <= 0 && setIsGameRevealed(true)}
            disabled={
              guessesNeededForGame > 0 || isGameRevealed || hasWon || isGameOver
            }
          >
            {isGameRevealed || hasWon || isGameOver
              ? `Game: ${targetQuote.game}`
              : "Reveal Game"}
          </button>

          {!(hasWon || isGameOver) && (
            <div className="hint-condition">
              {guessesNeededForGame > 0
                ? `Available after ${guessesNeededForGame} more guess${
                    guessesNeededForGame > 1 ? "es" : ""
                  }`
                : "Unlocked!"}
            </div>
          )}
        </div>

        {/* --- HINT 2: REVEAL RECIPIENT --- */}
        <div className="hint-wrapper" style={{ margin: "0 auto" }}>
          <button
            className={`hint-btn ${
              isRecipientRevealed || hasWon || isGameOver
                ? "revealed"
                : guessesNeededForRecipient <= 0
                ? "unlocked"
                : "locked"
            }`}
            onClick={() =>
              guessesNeededForRecipient <= 0 && setIsRecipientRevealed(true)
            }
            disabled={
              guessesNeededForRecipient > 0 ||
              isRecipientRevealed ||
              hasWon ||
              isGameOver
            }
          >
            {isRecipientRevealed || hasWon || isGameOver
              ? `To: ${targetQuote.recipient}`
              : "Reveal Recipient"}
          </button>

          {!(hasWon || isGameOver) && (
            <div className="hint-condition">
              {guessesNeededForRecipient > 0
                ? `Available after ${guessesNeededForRecipient} more guess${
                    guessesNeededForRecipient > 1 ? "es" : ""
                  }`
                : "Unlocked!"}
            </div>
          )}
        </div>
      </div>

      {!hasWon && !isGameOver && (
        <div className="search-container">
          <input
            type="text"
            className="search-input"
            value={currentGuess}
            onChange={handleInputChange}
            placeholder="Type a character name..."
          />
          <button
            className="submit-button"
            onClick={() =>
              suggestions.length > 0 && handleGuess(suggestions[0])
            }
          >
            Submit Guess
          </button>
          {suggestions.length > 0 && (
            <ul className="suggestions-list">
              {suggestions.map((item) => (
                <li key={item.id} onClick={() => handleGuess(item)}>
                  {item.name || item.displayTitle || item.locationName}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ul className="guess-list">
        {guessedCharacters
          .slice()
          .reverse()
          .map((char, index) => {
            const isCorrect = char.name === targetQuote.character;
            return (
              <li
                key={index}
                className={`guess-item ${isCorrect ? "correct" : "incorrect"}`}
              >
                <strong>{char.name}</strong>
                <span>{isCorrect ? "🎉 Correct!" : "❌ Incorrect"}</span>
              </li>
            );
          })}
      </ul>
    </div>
  );
}

// ==========================================
// 4. MUSIC MODE COMPONENT (HEARDLE TIMER VERSION)
// ==========================================
function MusicMode({
  version,
  targetDateObj,
  targetDateStr,
  isArchive,
  setIsModalOpen,
}) {
  const [currentGuess, setCurrentGuess] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [storedTracks, setGuessedTracks] = useDailyLocalStorage(
    "kisekidle-music",
    targetDateStr
  );
  const guessedTracks = storedTracks || [];
  const [isCopied, setIsCopied] = useState(false);

  const [targetTrack] = useState(getDailyItem(MUSIC, targetDateObj));

  const MAX_GUESSES = 6;
  const wrongGuessesCount = guessedTracks.filter(
    (track) => track.id !== targetTrack.id
  ).length;
  const hasWon = guessedTracks.some((track) => track.id === targetTrack.id);
  const guessesLeft = MAX_GUESSES - guessedTracks.length;
  const isGameOver = guessesLeft <= 0 && !hasWon;

  const TIME_LIMITS = [1, 2, 5, 10, 30, 9999];
  const currentAllowedTime =
    TIME_LIMITS[Math.min(guessedTracks.length, TIME_LIMITS.length - 1)];

  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.5);

  const togglePlay = () => {
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.currentTime = 0;
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleVolumeChange = (e) => {
    const newVol = parseFloat(e.target.value);
    setVolume(newVol);
    if (audioRef.current) {
      audioRef.current.volume = newVol;
    }
  };

  const handleTimeUpdate = (e) => {
    if (e.target.currentTime >= currentAllowedTime && !hasWon) {
      e.target.pause();
      e.target.currentTime = 0;
      setIsPlaying(false);
    }
  };

  const [isGameRevealed, setIsGameRevealed] = useState(false);
  const [isTypeRevealed, setIsTypeRevealed] = useState(false);
  const guessesNeededForType = Math.max(0, 2 - wrongGuessesCount);
  const guessesNeededForGame = Math.max(0, 4 - wrongGuessesCount);

  const handleInputChange = (e) => {
    const value = e.target.value;
    setCurrentGuess(value);

    if (value.length > 0) {
      const searchStr = value.toLowerCase();
      const filteredTracks = MUSIC.filter((track) => {
        const matchTitle = track.title.toLowerCase().includes(searchStr);
        const matchDisplay = track.displayTitle
          .toLowerCase()
          .includes(searchStr);
        const matchGame = track.game.toLowerCase().includes(searchStr);
        return matchTitle || matchDisplay || matchGame;
      });
      setSuggestions(filteredTracks);
    } else {
      setSuggestions([]);
    }
  };

  const handleGuess = (selectedTrack) => {
    if (hasWon || isGameOver) return;
    if (guessedTracks.find((t) => t.id === selectedTrack.id)) return;

    const newGuesses = [...guessedTracks, selectedTrack];
    const isWin = selectedTrack.id === targetTrack.id;
    const isLoss = newGuesses.length >= MAX_GUESSES && !isWin;

    if (!isArchive && (isWin || isLoss)) {
      if (typeof updateGameStats === "function") {
        updateGameStats("music", isWin, newGuesses.length, MAX_GUESSES);
      }
    }

    setGuessedTracks(newGuesses);
    setCurrentGuess("");
    setSuggestions([]);

    if (isWin) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  const handleShare = () => {
    const score = hasWon ? guessedTracks.length : "X";
    let shareText = `Kisekidle - Music\nGuesses: ${score}/${MAX_GUESSES}\n\n`;
    const emojis = guessedTracks
      .map((track) => (track.id === targetTrack.id ? "🟩" : "🟥"))
      .join("");
    shareText += emojis;
    navigator.clipboard.writeText(shareText).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  };

  return (
    <div style={{ maxWidth: "600px", margin: "0 auto", width: "100%" }}>
      <div className="header-container">
        <h2 className="mode-title">Listen to the Track</h2>
        <div
          style={{
            textAlign: "center",
            marginBottom: "20px",
            fontWeight: "bold",
          }}
        >
          Guesses Remaining: {guessesLeft}
        </div>
      </div>

      <audio
        ref={audioRef}
        src={targetTrack.audioUrl}
        onEnded={() => setIsPlaying(false)}
        onTimeUpdate={handleTimeUpdate}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          marginBottom: "30px",
          backgroundColor: "#1a1e2a",
          padding: "20px",
          borderRadius: "12px",
          border: "2px solid #2d3446",
        }}
      >
        <div style={{ fontSize: "4rem", marginBottom: "5px" }}>
          {isPlaying ? "🎶" : "🎵"}
        </div>
        <p
          style={{ color: "#a0a5b5", marginBottom: "15px", fontWeight: "bold" }}
        >
          Unlocked:{" "}
          {currentAllowedTime === 9999
            ? "Full Track"
            : `${currentAllowedTime} seconds`}
        </p>
        <button
          className="submit-button"
          onClick={togglePlay}
          style={{
            width: "180px",
            backgroundColor: isPlaying ? "#ff4d4d" : "#4caf50",
            color: "#12151e",
            fontWeight: "bold",
            padding: "12px",
            fontSize: "16px",
            marginBottom: "15px",
          }}
        >
          {isPlaying ? "⏹️ Pause Track" : "▶️ Play Track"}
        </button>
        <div
          className="volume-container"
          style={{ display: "flex", alignItems: "center", gap: "10px" }}
        >
          <span>🔈</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={handleVolumeChange}
            className="volume-slider"
          />
          <span>🔊</span>
        </div>
      </div>

      {hasWon && (
        <div className="victory-box">
          <Confetti
            width={window.innerWidth}
            height={window.innerHeight}
            recycle={false}
            numberOfPieces={400}
            gravity={0.15}
          />
          <h3>🎉 You got it! 🎉</h3>
          <p>
            The track was <strong>{targetTrack.title}</strong>.
          </p>
          <button className="share-button" onClick={handleShare}>
            {isCopied ? "📋 Copied to Clipboard!" : "📤 Share Results"}
          </button>
        </div>
      )}

      {isGameOver && (
        <div className="game-over-box">
          <h3>❌ Out of guesses! ❌</h3>
          <p>
            The correct track was <strong>{targetTrack.title}</strong>.
          </p>
          <button className="share-button" onClick={handleShare}>
            {isCopied ? "📋 Copied to Clipboard!" : "📤 Share Results"}
          </button>
        </div>
      )}

      <div className="hints-container">
        {/* --- HINT 1: REVEAL TYPE --- */}
        <div className="hint-wrapper" style={{ margin: "0 auto" }}>
          <button
            className={`hint-btn ${
              isTypeRevealed || hasWon || isGameOver
                ? "revealed"
                : guessesNeededForType <= 0
                ? "unlocked"
                : "locked"
            }`}
            onClick={() => guessesNeededForType <= 0 && setIsTypeRevealed(true)}
            disabled={
              guessesNeededForType > 0 || isTypeRevealed || hasWon || isGameOver
            }
          >
            {isTypeRevealed || hasWon || isGameOver
              ? `Type: ${targetTrack.type}`
              : "Reveal Type"}
          </button>

          {!(hasWon || isGameOver) && (
            <div className="hint-condition">
              {guessesNeededForType > 0
                ? `Available after ${guessesNeededForType} more guess${
                    guessesNeededForType > 1 ? "es" : ""
                  }`
                : "Unlocked!"}
            </div>
          )}
        </div>

        {/* --- HINT 2: REVEAL GAME --- */}
        <div className="hint-wrapper" style={{ margin: "0 auto" }}>
          <button
            className={`hint-btn ${
              isGameRevealed || hasWon || isGameOver
                ? "revealed"
                : guessesNeededForGame <= 0
                ? "unlocked"
                : "locked"
            }`}
            onClick={() => guessesNeededForGame <= 0 && setIsGameRevealed(true)}
            disabled={
              guessesNeededForGame > 0 || isGameRevealed || hasWon || isGameOver
            }
          >
            {isGameRevealed || hasWon || isGameOver
              ? `Game: ${targetTrack.game}`
              : "Reveal Game"}
          </button>

          {!(hasWon || isGameOver) && (
            <div className="hint-condition">
              {guessesNeededForGame > 0
                ? `Available after ${guessesNeededForGame} more guess${
                    guessesNeededForGame > 1 ? "es" : ""
                  }`
                : "Unlocked!"}
            </div>
          )}
        </div>
      </div>

      {!hasWon && !isGameOver && (
        <div className="search-container">
          <input
            type="text"
            className="search-input"
            value={currentGuess}
            onChange={handleInputChange}
            placeholder="Guess the track title..."
          />
          <button
            className="submit-button"
            onClick={() =>
              suggestions.length > 0 && handleGuess(suggestions[0])
            }
          >
            Submit Guess
          </button>
          {suggestions.length > 0 && (
            <ul className="suggestions-list">
              {suggestions.map((track) => (
                <li key={track.id} onClick={() => handleGuess(track)}>
                  {track.displayTitle}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ul className="guess-list">
        {guessedTracks
          .slice()
          .reverse()
          .map((track, index) => {
            const isCorrect = track.id === targetTrack.id;
            return (
              <li
                key={index}
                className={`guess-item ${isCorrect ? "correct" : "incorrect"}`}
              >
                <strong>{track.title}</strong>
                <span>{isCorrect ? "🎉 Correct!" : "❌ Incorrect"}</span>
              </li>
            );
          })}
      </ul>
    </div>
  );
}

// ==========================================
// 5. LOCATION MODE COMPONENT
// ==========================================
function LocationMode({
  version,
  targetDateObj,
  targetDateStr,
  isArchive,
  setIsModalOpen,
}) {
  const [currentGuess, setCurrentGuess] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [storedLocations, setGuessedLocations] = useDailyLocalStorage(
    "kisekidle-locations",
    targetDateStr
  );
  const guessedLocations = storedLocations || [];
  const [isCopied, setIsCopied] = useState(false);

  const [targetLocation] = useState(getDailyItem(LOCATIONS, targetDateObj));

  const MAX_GUESSES = 5;
  const wrongGuessesCount = guessedLocations.filter(
    (loc) => loc.id !== targetLocation.id
  ).length;
  const hasWon = guessedLocations.some((loc) => loc.id === targetLocation.id);
  const guessesLeft = MAX_GUESSES - guessedLocations.length;
  const isGameOver = guessesLeft <= 0 && !hasWon;

  const [isNationRevealed, setIsNationRevealed] = useState(false);
  const guessesNeededForNation = Math.max(0, 3 - wrongGuessesCount);

  // --- CAROUSEL LOGIC ---
  // If the game is over, unlock all images. Otherwise, limit it by wrong guesses.
  const maxRevealedIndex =
    hasWon || isGameOver
      ? targetLocation.imageFilePaths.length - 1
      : Math.min(wrongGuessesCount, targetLocation.imageFilePaths.length - 1);

  const [currentImageIndex, setCurrentImageIndex] = useState(maxRevealedIndex);

  // Automatically jump to the newest image whenever a new clue is unlocked
  useEffect(() => {
    setCurrentImageIndex(maxRevealedIndex);
  }, [maxRevealedIndex]);

  const currentImageUrl = targetLocation.imageFilePaths[currentImageIndex];

  const handleInputChange = (e) => {
    const value = e.target.value;
    setCurrentGuess(value);

    if (value.length > 0) {
      const searchStr = value.toLowerCase();
      const filteredLocs = LOCATIONS.filter((loc) => {
        const matchName = loc.locationName.toLowerCase().includes(searchStr);
        const matchNation = loc.locationNation
          .toLowerCase()
          .includes(searchStr);
        return matchName || matchNation;
      });
      setSuggestions(filteredLocs);
    } else {
      setSuggestions([]);
    }
  };

  const handleGuess = (selectedLoc) => {
    if (hasWon || isGameOver) return;
    if (guessedLocations.find((l) => l.id === selectedLoc.id)) return;

    const newGuesses = [...guessedLocations, selectedLoc];
    const isWin = selectedLoc.id === targetLocation.id;
    const isLoss = newGuesses.length >= MAX_GUESSES && !isWin;

    if (!isArchive && (isWin || isLoss)) {
      updateGameStats("location", isWin, newGuesses.length, MAX_GUESSES);
    }
    setGuessedLocations(newGuesses);
    setCurrentGuess("");
    setSuggestions([]);
  };

  const handleShare = () => {
    const score = hasWon ? guessedLocations.length : "X";
    let shareText = `Kisekidle - Location\nGuesses: ${score}/${MAX_GUESSES}\n\n`;
    const emojis = guessedLocations
      .map((loc) => (loc.id === targetLocation.id ? "🟩" : "🟥"))
      .join("");
    shareText += emojis;
    navigator.clipboard.writeText(shareText).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  };

  return (
    <div style={{ maxWidth: "600px", margin: "0 auto", width: "100%" }}>
      <div className="header-container">
        <h2 className="mode-title">Guess the Location</h2>
        <div
          style={{
            textAlign: "center",
            marginBottom: "10px",
            fontWeight: "bold",
          }}
        >
          Guesses Remaining: {guessesLeft}
        </div>
        <p
          style={{
            color: "#a0a5b5",
            margin: "0 0 15px 0",
            textAlign: "center",
          }}
        >
          Image Clues ({maxRevealedIndex + 1} of{" "}
          {targetLocation.imageFilePaths.length} Unlocked)
        </p>
      </div>

      {/* --- IMAGE CONTAINER (Arrows removed) --- */}
      <div
        style={{
          width: "100%",
          height: "300px",
          backgroundColor: "#1a1e2a",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "8px",
          marginBottom: "15px" /* Reduced to keep buttons close to the image */,
          overflow: "hidden",
          boxShadow: "0 4px 6px rgba(0,0,0,0.5)",
        }}
      >
        <img
          src={currentImageUrl}
          alt={`Location Clue ${currentImageIndex + 1}`}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </div>

      {/* --- PAGINATION BUTTONS --- */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: "10px",
          marginBottom: "30px",
        }}
      >
        {/* This creates an array of buttons exactly matching the number of unlocked images */}
        {Array.from({ length: maxRevealedIndex + 1 }).map((_, index) => (
          <button
            key={index}
            onClick={() => setCurrentImageIndex(index)}
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "6px",
              border: "none",
              backgroundColor:
                currentImageIndex === index ? "#4a90e2" : "#2d3446", // Highlights the active image
              color: "white",
              fontWeight: "bold",
              cursor: "pointer",
              transition: "all 0.2s ease",
              boxShadow:
                currentImageIndex === index
                  ? "0 0 8px rgba(74, 144, 226, 0.5)"
                  : "none",
            }}
          >
            {index + 1}
          </button>
        ))}
      </div>

      {hasWon && (
        <div className="victory-box">
          <Confetti
            width={window.innerWidth}
            height={window.innerHeight}
            recycle={false}
            numberOfPieces={400}
            gravity={0.15}
          />
          <h3>🎉 You got it! 🎉</h3>
          <p>
            The location was <strong>{targetLocation.locationName}</strong>.
          </p>
          <button className="share-button" onClick={handleShare}>
            {isCopied ? "📋 Copied to Clipboard!" : "📤 Share Results"}
          </button>
        </div>
      )}

      {isGameOver && (
        <div className="game-over-box">
          <h3>❌ Out of guesses! ❌</h3>
          <p>
            The correct location was{" "}
            <strong>{targetLocation.locationName}</strong>.
          </p>
          <button className="share-button" onClick={handleShare}>
            {isCopied ? "📋 Copied to Clipboard!" : "📤 Share Results"}
          </button>
        </div>
      )}

      <div className="hints-container">
        <div className="hint-wrapper" style={{ margin: "0 auto" }}>
          <button
            className={`hint-btn ${
              isNationRevealed || hasWon || isGameOver
                ? "revealed"
                : guessesNeededForNation <= 0
                ? "unlocked"
                : "locked"
            }`}
            onClick={() =>
              guessesNeededForNation <= 0 && setIsNationRevealed(true)
            }
            disabled={
              guessesNeededForNation > 0 ||
              isNationRevealed ||
              hasWon ||
              isGameOver
            }
          >
            {isNationRevealed || hasWon || isGameOver
              ? `Nation: ${targetLocation.locationNation}`
              : "Reveal Nation"}
          </button>

          {!(hasWon || isGameOver) && (
            <div className="hint-condition">
              {guessesNeededForNation > 0
                ? `Available after ${guessesNeededForNation} more guess${
                    guessesNeededForNation > 1 ? "es" : ""
                  }`
                : "Unlocked!"}
            </div>
          )}
        </div>
      </div>

      {!hasWon && !isGameOver && (
        <div className="search-container">
          <input
            type="text"
            className="search-input"
            value={currentGuess}
            onChange={handleInputChange}
            placeholder="Guess the location (or search by Nation)..."
          />
          <button
            className="submit-button"
            onClick={() =>
              suggestions.length > 0 && handleGuess(suggestions[0])
            }
          >
            Submit Guess
          </button>
          {suggestions.length > 0 && (
            <ul className="suggestions-list">
              {suggestions.map((loc) => (
                <li key={loc.id} onClick={() => handleGuess(loc)}>
                  {loc.locationName}{" "}
                  <span style={{ fontSize: "12px", color: "#888" }}>
                    ({loc.locationNation})
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ul className="guess-list">
        {guessedLocations
          .slice()
          .reverse()
          .map((loc, index) => {
            const isCorrect = loc.id === targetLocation.id;
            return (
              <li
                key={index}
                className={`guess-item ${isCorrect ? "correct" : "incorrect"}`}
              >
                <strong>{loc.locationName}</strong>
                <span>{isCorrect ? "🎉 Correct!" : "❌ Incorrect"}</span>
              </li>
            );
          })}
      </ul>
    </div>
  );
}

// ==========================================
// 6. TODAY'S RESULTS COMPONENT
// ==========================================
function ResultsMode({ version, targetDateObj, targetDateStr, isArchive }) {
  const [isCopied, setIsCopied] = useState(false);

  const getStoredData = (baseKey) => {
    const todayStr = `${new Date().getUTCFullYear()}-${
      new Date().getUTCMonth() + 1
    }-${new Date().getUTCDate()}`;
    const isToday = targetDateStr === todayStr;
    const storageKey = isToday ? baseKey : `${baseKey}-${targetDateStr}`;
    const storedData = localStorage.getItem(storageKey);

    if (storedData) {
      try {
        return JSON.parse(storedData);
      } catch (e) {
        return { guesses: [] };
      }
    }
    return { guesses: [] };
  };

  const charData = getStoredData("kisekidle-chars");
  const quoteData = getStoredData("kisekidle-quotes");
  const musicData = getStoredData("kisekidle-music");
  const locData = getStoredData("kisekidle-locations");
  const triviaData = getStoredData("kisekidle-trivia");
  const craftData = getStoredData("kisekidle-crafts");
  const silhouetteData = getStoredData("kisekidle-silhouette"); // NEW

  const targetChar = getDailyItem(CHARACTERS, targetDateObj);
  const targetQuote = getDailyItem(QUOTES, targetDateObj);
  const targetMusic = getDailyItem(MUSIC, targetDateObj);
  const targetLocation = getDailyItem(LOCATIONS, targetDateObj);
  const targetTrivia = getDailyItem(TRIVIA, targetDateObj);
  const targetCraft = getDailyItem(CRAFTS, targetDateObj);
  const targetSilhouette = getDailyItem(SILHOUETTES, targetDateObj); // NEW

  const checkTriviaCorrect = (guess) => {
    if (!targetTrivia) return false;
    const guessLower = guess.toLowerCase().trim();
    const answerLower = targetTrivia.answer.toLowerCase().trim();
    if (guessLower === answerLower) return true;
    if (targetTrivia.acceptedAnswers) {
      return targetTrivia.acceptedAnswers.some(
        (alt) => alt.toLowerCase().trim() === guessLower
      );
    }
    return false;
  };

  const getStatus = (guesses, maxGuesses, checkWinFn) => {
    if (guesses.length === 0)
      return { text: "Not Played", class: "status-unplayed", score: "" };
    const hasWon = guesses.some(checkWinFn);
    if (hasWon)
      return {
        text: "Won! 🎉",
        class: "status-won",
        score: `${guesses.length}/${maxGuesses}`,
      };
    if (guesses.length >= maxGuesses)
      return {
        text: "Lost ❌",
        class: "status-lost",
        score: `X/${maxGuesses}`,
      };
    return {
      text: "In Progress ⏳",
      class: "status-playing",
      score: `${guesses.length}/${maxGuesses}`,
    };
  };

  const charStatus = getStatus(
    charData.guesses,
    10,
    (g) => g.id === targetChar.id
  );
  const quoteStatus = getStatus(
    quoteData.guesses,
    6,
    (g) => g.name === targetQuote.character
  );
  const musicStatus = getStatus(
    musicData.guesses,
    6,
    (g) => g.title === targetMusic.title
  );
  const locStatus = getStatus(
    locData.guesses,
    5,
    (g) => g.id === targetLocation.id
  );
  const triviaStatus = getStatus(triviaData.guesses, 2, checkTriviaCorrect); // Updated max to 2!
  const craftStatus = getStatus(
    craftData.guesses,
    6,
    (g) => g.id === targetCraft.id
  );
  const silhouetteStatus = getStatus(
    silhouetteData.guesses,
    5,
    (g) => g === targetSilhouette.character
  ); // NEW

  // --- BUGFIX: EMOJI GENERATOR FOR GLOBAL SHARE ---
  // Your old code was missing the emoji variables entirely, which would crash the app when clicked!
  // This helper builds the colored squares for each mode perfectly.
  const generateEmojiString = (guesses, maxGuesses, checkWinFn) => {
    if (guesses.length === 0) return "⬛".repeat(maxGuesses);
    let str = guesses.map((g) => (checkWinFn(g) ? "🟩" : "🟥")).join("");
    // Pad the rest of the un-used guesses with black squares
    if (guesses.length < maxGuesses) {
      str += "⬛".repeat(maxGuesses - guesses.length);
    }
    return str;
  };

  const handleShare = () => {
    const charEmojis = generateEmojiString(
      charData.guesses,
      10,
      (g) => g.id === targetChar.id
    );
    const quoteEmojis = generateEmojiString(
      quoteData.guesses,
      6,
      (g) => g.name === targetQuote.character
    );
    const musicEmojis = generateEmojiString(
      musicData.guesses,
      6,
      (g) => g.title === targetMusic.title
    );
    const locEmojis = generateEmojiString(
      locData.guesses,
      5,
      (g) => g.id === targetLocation.id
    );
    const triviaEmojis = generateEmojiString(
      triviaData.guesses,
      2,
      checkTriviaCorrect
    );
    const craftEmojis = generateEmojiString(
      craftData.guesses,
      6,
      (g) => g.id === targetCraft.id
    );
    const silhouetteEmojis = generateEmojiString(
      silhouetteData.guesses,
      5,
      (g) => g === targetSilhouette.character
    );

    const shareHeader = isArchive
      ? `Kisekidle (Archive: ${targetDateStr})`
      : `Kisekidle (${targetDateStr})`;

    let textToShare =
      `${shareHeader}\n` +
      `🎭 ${charEmojis}\n` +
      `💬 ${quoteEmojis}\n` +
      `🎵 ${musicEmojis}\n` +
      `📍 ${locEmojis}\n`;

    if (version === "new") {
      textToShare +=
        `🧠 ${triviaEmojis}\n` +
        `⚔️ ${craftEmojis}\n` +
        `👥 ${silhouetteEmojis}\n`;
    }

    textToShare += `\nhttps://kisekidle.com`;

    navigator.clipboard.writeText(textToShare);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className="mode-container">
      <div className="header-container">
        <h2 className="mode-title">
          {isArchive
            ? `📅 Archive Results: ${targetDateStr}`
            : "📊 Today's Results"}
        </h2>
      </div>

      <div className="results-grid">
        <div className="result-card">
          <div className="result-icon">🎭</div>
          <div className="result-name">Character</div>
          <div className={`result-status ${charStatus.class}`}>
            {charStatus.text}
          </div>
          <div style={{ fontWeight: "bold" }}>{charStatus.score || "-"}</div>
        </div>
        <div className="result-card">
          <div className="result-icon">💬</div>
          <div className="result-name">Quote</div>
          <div className={`result-status ${quoteStatus.class}`}>
            {quoteStatus.text}
          </div>
          <div style={{ fontWeight: "bold" }}>{quoteStatus.score || "-"}</div>
        </div>
        <div className="result-card">
          <div className="result-icon">🎵</div>
          <div className="result-name">Music</div>
          <div className={`result-status ${musicStatus.class}`}>
            {musicStatus.text}
          </div>
          <div style={{ fontWeight: "bold" }}>{musicStatus.score || "-"}</div>
        </div>
        <div className="result-card">
          <div className="result-icon">📍</div>
          <div className="result-name">Location</div>
          <div className={`result-status ${locStatus.class}`}>
            {locStatus.text}
          </div>
          <div style={{ fontWeight: "bold" }}>{locStatus.score || "-"}</div>
        </div>

        {version === "new" && (
          <>
            <div className="result-card">
              <div className="result-icon">🧠</div>
              <div className="result-name">Trivia</div>
              <div className={`result-status ${triviaStatus.class}`}>
                {triviaStatus.text}
              </div>
              <div style={{ fontWeight: "bold" }}>
                {triviaStatus.score || "-"}
              </div>
            </div>
            <div className="result-card">
              <div className="result-icon">⚔️</div>
              <div className="result-name">Crafts</div>
              <div className={`result-status ${craftStatus.class}`}>
                {craftStatus.text}
              </div>
              <div style={{ fontWeight: "bold" }}>
                {craftStatus.score || "-"}
              </div>
            </div>
            {/* NEW: Silhouette Result Card */}
            <div className="result-card">
              <div className="result-icon">👥</div>
              <div className="result-name">Silhouette</div>
              <div className={`result-status ${silhouetteStatus.class}`}>
                {silhouetteStatus.text}
              </div>
              <div style={{ fontWeight: "bold" }}>
                {silhouetteStatus.score || "-"}
              </div>
            </div>
          </>
        )}
      </div>

      {(charData.guesses.length > 0 ||
        quoteData.guesses.length > 0 ||
        musicData.guesses.length > 0 ||
        locData.guesses.length > 0 ||
        triviaData.guesses.length > 0 ||
        craftData.guesses.length > 0 ||
        silhouetteData.guesses.length > 0) && (
        <button className="share-all-btn" onClick={handleShare}>
          {isCopied ? "📋 Copied to Clipboard!" : "📤 Share All Results"}
        </button>
      )}
    </div>
  );
}

// ==========================================
// 7. TRIVIA MODE COMPONENT (MULTIPLE CHOICE)
// ==========================================
function TriviaMode({
  version,
  targetDateObj,
  targetDateStr,
  isArchive,
  setIsModalOpen,
}) {
  const [storedGuesses, setStoredGuesses] = useDailyLocalStorage(
    "kisekidle-trivia",
    targetDateStr
  );
  const guessedOptions = storedGuesses || [];
  const [isCopied, setIsCopied] = useState(false);
  const [targetTrivia] = useState(getDailyItem(TRIVIA, targetDateObj));

  const MAX_GUESSES = 2;
  const hasWon = guessedOptions.includes(targetTrivia.answer);
  const guessesLeft = MAX_GUESSES - guessedOptions.length;
  const isGameOver = guessesLeft <= 0 && !hasWon;

  const handleGuess = (selectedOption) => {
    if (hasWon || isGameOver) return;
    if (guessedOptions.includes(selectedOption)) return;

    const newGuesses = [...guessedOptions, selectedOption];
    const isWin = selectedOption === targetTrivia.answer;
    const isLoss = newGuesses.length >= MAX_GUESSES && !isWin;

    if (!isArchive && (isWin || isLoss)) {
      if (typeof updateGameStats === "function") {
        updateGameStats("trivia", isWin, newGuesses.length, MAX_GUESSES);
      }
    }
    setStoredGuesses(newGuesses);
  };

  const handleShare = () => {
    const score = hasWon ? guessedOptions.length : "X";
    let shareText = `Kisekidle - Trivia\nGuesses: ${score}/${MAX_GUESSES}\n\n`;
    const emojis = guessedOptions
      .map((guess) => (guess === targetTrivia.answer ? "🟩" : "🟥"))
      .join("");
    shareText += emojis;
    navigator.clipboard.writeText(shareText).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  };

  return (
    <div style={{ maxWidth: "600px", margin: "0 auto", width: "100%" }}>
      <div className="header-container">
        <h2 className="mode-title">Daily Trivia</h2>
        <div
          style={{
            textAlign: "center",
            marginBottom: "20px",
            fontWeight: "bold",
          }}
        >
          Guesses Remaining: {guessesLeft}
        </div>
      </div>

      <div
        style={{
          backgroundColor: "#1a1e2a",
          padding: "25px",
          borderRadius: "12px",
          border: "2px solid #2d3446",
          marginBottom: "25px",
          textAlign: "center",
          fontSize: "1.2rem",
          fontWeight: "bold",
          color: "#e0e6f8",
        }}
      >
        {targetTrivia.question}
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          marginBottom: "30px",
        }}
      >
        {targetTrivia.options &&
          targetTrivia.options.map((option, index) => {
            const isGuessed = guessedOptions.includes(option);
            const isCorrectAnswer = option === targetTrivia.answer;

            let btnBg = "#2d3446";
            let btnCursor = "pointer";
            let btnOpacity = 1;

            if (isGuessed) {
              btnCursor = "default";
              if (isCorrectAnswer) btnBg = "#4caf50";
              else {
                btnBg = "#ff4d4d";
                btnOpacity = 0.6;
              }
            } else if (hasWon || isGameOver) {
              btnCursor = "default";
              if (isCorrectAnswer) btnBg = "#4caf50";
              else btnOpacity = 0.4;
            }

            return (
              <button
                key={index}
                onClick={() => handleGuess(option)}
                disabled={isGuessed || hasWon || isGameOver}
                style={{
                  padding: "15px 20px",
                  fontSize: "1.1rem",
                  borderRadius: "8px",
                  border: "none",
                  backgroundColor: btnBg,
                  color: "#ffffff",
                  cursor: btnCursor,
                  opacity: btnOpacity,
                  transition: "all 0.2s",
                  fontWeight: "bold",
                }}
              >
                {option}
              </button>
            );
          })}
      </div>

      {hasWon && (
        <div className="victory-box">
          <Confetti
            width={window.innerWidth}
            height={window.innerHeight}
            recycle={false}
            numberOfPieces={400}
            gravity={0.15}
          />
          <h3>🎉 Correct! 🎉</h3>
          <p>Great job knowing your lore!</p>
          <button className="share-button" onClick={handleShare}>
            {isCopied ? "📋 Copied to Clipboard!" : "📤 Share Results"}
          </button>
        </div>
      )}

      {isGameOver && (
        <div className="game-over-box">
          <h3>❌ Out of guesses! ❌</h3>
          <p>
            The correct answer was <strong>{targetTrivia.answer}</strong>.
          </p>
          <button className="share-button" onClick={handleShare}>
            {isCopied ? "📋 Copied to Clipboard!" : "📤 Share Results"}
          </button>
        </div>
      )}
    </div>
  );
}

// ==========================================
// 8. CRAFTS MODE COMPONENT
// ==========================================
function CraftsMode({
  version,
  targetDateObj,
  targetDateStr,
  isArchive,
  setIsModalOpen,
}) {
  const [currentGuess, setCurrentGuess] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [storedGuesses, setGuessedCrafts] = useDailyLocalStorage(
    "kisekidle-crafts",
    targetDateStr
  );
  const guessedCrafts = storedGuesses || [];
  const [isCopied, setIsCopied] = useState(false);

  const [targetCraft] = useState(getDailyItem(CRAFTS, targetDateObj));

  const MAX_GUESSES = 6;
  const wrongGuessesCount = guessedCrafts.filter(
    (craft) => craft.craftName !== targetCraft.craftName
  ).length;
  const hasWon = guessedCrafts.some(
    (craft) => craft.craftName === targetCraft.craftName
  );
  const guessesLeft = MAX_GUESSES - guessedCrafts.length;
  const isGameOver = guessesLeft <= 0 && !hasWon;

  const [isGenderRevealed, setIsGenderRevealed] = useState(false);
  const [isGameRevealed, setIsGameRevealed] = useState(false);
  const guessesNeededForGender = Math.max(0, 2 - wrongGuessesCount);
  const guessesNeededForGame = Math.max(0, 4 - wrongGuessesCount);

  const handleInputChange = (e) => {
    const value = e.target.value;
    setCurrentGuess(value);
    if (value.length > 0) {
      const searchStr = value.toLowerCase();
      const filteredCrafts = CRAFTS.filter((craft) => {
        const matchCraft = craft.craftName.toLowerCase().includes(searchStr);
        const matchChar = craft.character.toLowerCase().includes(searchStr);
        return matchCraft || matchChar;
      });
      setSuggestions(filteredCrafts);
    } else {
      setSuggestions([]);
    }
  };

  const handleGuess = (selectedCraft) => {
    if (hasWon || isGameOver) return;
    if (guessedCrafts.find((c) => c.craftName === selectedCraft.craftName))
      return;

    const newGuesses = [...guessedCrafts, selectedCraft];
    const isWin = selectedCraft.craftName === targetCraft.craftName;
    const isLoss = newGuesses.length >= MAX_GUESSES && !isWin;

    if (!isArchive && (isWin || isLoss)) {
      updateGameStats("crafts", isWin, newGuesses.length, MAX_GUESSES);
    }
    setGuessedCrafts(newGuesses);
    setCurrentGuess("");
    setSuggestions([]);
  };

  const handleShare = () => {
    const score = hasWon ? guessedCrafts.length : "X";
    let shareText = `Kisekidle - Crafts\nGuesses: ${score}/${MAX_GUESSES}\n\n`;
    const emojis = guessedCrafts
      .map((craft) => (craft.craftName === targetCraft.craftName ? "🟩" : "🟥"))
      .join("");
    shareText += emojis;
    navigator.clipboard.writeText(shareText).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  };

  return (
    <div style={{ maxWidth: "600px", margin: "0 auto", width: "100%" }}>
      <div className="header-container">
        <h2 className="mode-title">Guess the Craft</h2>
        <div
          style={{
            textAlign: "center",
            marginBottom: "20px",
            fontWeight: "bold",
          }}
        >
          Guesses Remaining: {guessesLeft}
        </div>
      </div>

      <div className="quote-box" style={{ fontStyle: "italic" }}>
        "{targetCraft.description}"
      </div>

      <div className="hints-container">
        {/* --- HINT 1: REVEAL GENDER --- */}
        <div className="hint-wrapper" style={{ margin: "0 auto" }}>
          <button
            className={`hint-btn ${
              isGenderRevealed || hasWon || isGameOver
                ? "revealed"
                : guessesNeededForGender <= 0
                ? "unlocked"
                : "locked"
            }`}
            onClick={() =>
              guessesNeededForGender <= 0 && setIsGenderRevealed(true)
            }
            disabled={
              guessesNeededForGender > 0 ||
              isGenderRevealed ||
              hasWon ||
              isGameOver
            }
          >
            {isGenderRevealed || hasWon || isGameOver
              ? `Gender: ${targetCraft.gender}`
              : "Reveal Gender"}
          </button>

          {!(hasWon || isGameOver) && (
            <div className="hint-condition">
              {guessesNeededForGender > 0
                ? `Available after ${guessesNeededForGender} more guess${
                    guessesNeededForGender > 1 ? "es" : ""
                  }`
                : "Unlocked!"}
            </div>
          )}
        </div>

        {/* --- HINT 2: REVEAL GAME --- */}
        <div className="hint-wrapper" style={{ margin: "0 auto" }}>
          <button
            className={`hint-btn ${
              isGameRevealed || hasWon || isGameOver
                ? "revealed"
                : guessesNeededForGame <= 0
                ? "unlocked"
                : "locked"
            }`}
            onClick={() => guessesNeededForGame <= 0 && setIsGameRevealed(true)}
            disabled={
              guessesNeededForGame > 0 || isGameRevealed || hasWon || isGameOver
            }
          >
            {isGameRevealed || hasWon || isGameOver
              ? `Game: ${targetCraft.game}`
              : "Reveal Debut Game"}
          </button>

          {!(hasWon || isGameOver) && (
            <div className="hint-condition">
              {guessesNeededForGame > 0
                ? `Available after ${guessesNeededForGame} more guess${
                    guessesNeededForGame > 1 ? "es" : ""
                  }`
                : "Unlocked!"}
            </div>
          )}
        </div>
      </div>

      {hasWon && (
        <div className="victory-box">
          <Confetti
            width={window.innerWidth}
            height={window.innerHeight}
            recycle={false}
            numberOfPieces={400}
            gravity={0.15}
          />
          <h3>🎉 You got it! 🎉</h3>
          <p>
            The craft was <strong>{targetCraft.craftName}</strong> used by{" "}
            <strong>{targetCraft.character}</strong>.
          </p>
          <button className="share-button" onClick={handleShare}>
            {isCopied ? "📋 Copied to Clipboard!" : "📤 Share Results"}
          </button>
        </div>
      )}

      {isGameOver && (
        <div className="game-over-box">
          <h3>❌ Out of guesses! ❌</h3>
          <p>
            The correct craft was <strong>{targetCraft.craftName}</strong> used
            by <strong>{targetCraft.character}</strong>.
          </p>
          <button className="share-button" onClick={handleShare}>
            {isCopied ? "📋 Copied to Clipboard!" : "📤 Share Results"}
          </button>
        </div>
      )}

      {!hasWon && !isGameOver && (
        <div className="search-container">
          <input
            type="text"
            className="search-input"
            value={currentGuess}
            onChange={handleInputChange}
            placeholder="Search by craft or character name..."
          />
          <button
            className="submit-button"
            onClick={() =>
              suggestions.length > 0 && handleGuess(suggestions[0])
            }
          >
            Submit Guess
          </button>
          {suggestions.length > 0 && (
            <ul className="suggestions-list">
              {suggestions.map((craft) => (
                <li key={craft.id} onClick={() => handleGuess(craft)}>
                  {craft.craftName}{" "}
                  <span style={{ fontSize: "12px", color: "#888" }}>
                    ({craft.character})
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ul className="guess-list">
        {guessedCrafts
          .slice()
          .reverse()
          .map((craft, index) => {
            const isCorrect = craft.craftName === targetCraft.craftName;
            return (
              <li
                key={index}
                className={`guess-item ${isCorrect ? "correct" : "incorrect"}`}
              >
                <strong>{craft.craftName}</strong>
                <span>{isCorrect ? "🎉 Correct!" : "❌ Incorrect"}</span>
              </li>
            );
          })}
      </ul>
    </div>
  );
}

// ==========================================
// 9. SILHOUETTE MODE COMPONENT
// ==========================================
function SilhouetteMode({
  version,
  targetDateObj,
  targetDateStr,
  isArchive,
  setIsModalOpen,
}) {
  const [currentGuess, setCurrentGuess] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [storedGuesses, setStoredGuesses] = useDailyLocalStorage(
    "kisekidle-silhouette",
    targetDateStr
  );
  const guessedCharacters = storedGuesses || [];
  const [isCopied, setIsCopied] = useState(false);

  // UPDATED: Now uses the SILHOUETTES array from data.js!
  const [targetSilhouette] = useState(getDailyItem(SILHOUETTES, targetDateObj));

  const MAX_GUESSES = 5;
  const wrongGuessesCount = guessedCharacters.filter(
    (guess) => guess !== targetSilhouette.character
  ).length;
  const hasWon = guessedCharacters.includes(targetSilhouette.character);
  const guessesLeft = MAX_GUESSES - guessedCharacters.length;
  const isGameOver = guessesLeft <= 0 && !hasWon;

  const [isGameRevealed, setIsGameRevealed] = useState(false);
  const guessesNeededForGame = Math.max(0, 3 - wrongGuessesCount);

  // Dynamic Image Paths
  const silhouetteUrl = `/images/silhouettes/${targetSilhouette.id}.webp`;
  const answerUrl = `/images/silhouettes/${targetSilhouette.id}-answer.webp`;
  const showAnswerImage = hasWon || isGameOver;

  const handleInputChange = (e) => {
    const value = e.target.value;
    setCurrentGuess(value);
    if (value.length > 0) {
      const searchStr = value.toLowerCase();
      // STILL use CHARACTERS here so they can search ANY character in the game!
      const filtered = CHARACTERS.filter((c) =>
        c.name.toLowerCase().includes(searchStr)
      );
      setSuggestions(filtered);
    } else {
      setSuggestions([]);
    }
  };

  const handleGuess = (selectedCharacter) => {
    if (hasWon || isGameOver) return;
    if (guessedCharacters.includes(selectedCharacter.name)) return;

    const newGuesses = [...guessedCharacters, selectedCharacter.name];
    const isWin = selectedCharacter.name === targetSilhouette.character;
    const isLoss = newGuesses.length >= MAX_GUESSES && !isWin;

    if (!isArchive && (isWin || isLoss)) {
      if (typeof updateGameStats === "function") {
        updateGameStats("silhouette", isWin, newGuesses.length, MAX_GUESSES);
      }
    }

    setStoredGuesses(newGuesses);
    setCurrentGuess("");
    setSuggestions([]);
  };

  const handleShare = () => {
    const score = hasWon ? guessedCharacters.length : "X";
    let shareText = `Kisekidle - Silhouette\nGuesses: ${score}/${MAX_GUESSES}\n\n`;
    const emojis = guessedCharacters
      .map((guess) => (guess === targetSilhouette.character ? "🟩" : "🟥"))
      .join("");
    shareText += emojis;
    navigator.clipboard.writeText(shareText).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  };

  return (
    <div style={{ maxWidth: "600px", margin: "0 auto", width: "100%" }}>
      <div className="header-container">
        <h2 className="mode-title">Guess the Silhouette</h2>
        <div
          style={{
            textAlign: "center",
            marginBottom: "20px",
            fontWeight: "bold",
          }}
        >
          Guesses Remaining: {guessesLeft}
        </div>
      </div>

      <div
        style={{
          backgroundColor: "#50545e",
          padding: "20px",
          borderRadius: "12px",
          border: "2px solid #2d3446",
          marginBottom: "25px",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "300px",
        }}
      >
        <img
          src={silhouetteUrl}
          alt="Mystery Character"
          style={{
            maxWidth: "100%",
            maxHeight: "350px",
            objectFit: "contain",
            transition: "filter 0.5s ease-in-out",
            filter: showAnswerImage ? "none" : "brightness(0)",
          }}
        />
      </div>

      {hasWon && (
        <div className="victory-box">
          <Confetti
            width={window.innerWidth}
            height={window.innerHeight}
            recycle={false}
            numberOfPieces={400}
            gravity={0.15}
          />
          <h3>🎉 You got it! 🎉</h3>
          <p>
            It was <strong>{targetSilhouette.character}</strong>.
          </p>
          <button className="share-button" onClick={handleShare}>
            {isCopied ? "📋 Copied to Clipboard!" : "📤 Share Results"}
          </button>
        </div>
      )}

      {isGameOver && (
        <div className="game-over-box">
          <h3>❌ Out of guesses! ❌</h3>
          <p>
            The character was <strong>{targetSilhouette.character}</strong>.
          </p>
          <button className="share-button" onClick={handleShare}>
            {isCopied ? "📋 Copied to Clipboard!" : "📤 Share Results"}
          </button>
        </div>
      )}

      <div className="hints-container">
        <div className="hint-wrapper" style={{ margin: "0 auto" }}>
          <button
            className={`hint-btn ${
              isGameRevealed || hasWon || isGameOver
                ? "revealed"
                : guessesNeededForGame <= 0
                ? "unlocked"
                : "locked"
            }`}
            onClick={() => guessesNeededForGame <= 0 && setIsGameRevealed(true)}
            disabled={
              guessesNeededForGame > 0 || isGameRevealed || hasWon || isGameOver
            }
          >
            {isGameRevealed || hasWon || isGameOver
              ? `Debut: ${targetSilhouette.debutGame}`
              : "Reveal Debut Game"}
          </button>

          {!(hasWon || isGameOver) && (
            <div className="hint-condition">
              {guessesNeededForGame > 0
                ? `Available after ${guessesNeededForGame} more wrong guess${
                    guessesNeededForGame > 1 ? "es" : ""
                  }`
                : "Unlocked!"}
            </div>
          )}
        </div>
      </div>

      {!hasWon && !isGameOver && (
        <div className="search-container">
          <input
            type="text"
            className="search-input"
            value={currentGuess}
            onChange={handleInputChange}
            placeholder="Search for a character..."
          />
          {suggestions.length > 0 && (
            <ul className="suggestions-list">
              {suggestions.map((c) => (
                <li key={c.id} onClick={() => handleGuess(c)}>
                  {c.name}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ul className="guess-list">
        {guessedCharacters
          .slice()
          .reverse()
          .map((guess, index) => {
            const isCorrect = guess === targetSilhouette.character;
            return (
              <li
                key={index}
                className={`guess-item ${isCorrect ? "correct" : "incorrect"}`}
              >
                <strong>{guess}</strong>
                <span>{isCorrect ? "🎉 Correct!" : "❌ Incorrect"}</span>
              </li>
            );
          })}
      </ul>
    </div>
  );
}

// ==========================================
// 10. PROFILE MODE COMPONENT
// ==========================================
function ProfileMode({ version }) {
  const [collection] = usePersistentStorage("kisekidle-collection", []);

  const defaultStats = {
    overall: {
      games: 0,
      wins: 0,
      winRate: "0%",
      daysActive: 0,
      streak: 0,
      perfectGames: 0,
    },
    character: {
      played: 0,
      won: 0,
      winRate: "0%",
      avgGuesses: 0,
      currentStreak: 0,
      bestStreak: 0,
      firstTryWins: 0,
      closeCalls: 0,
    },
    quote: {
      played: 0,
      won: 0,
      winRate: "0%",
      avgGuesses: 0,
      currentStreak: 0,
      bestStreak: 0,
      firstTryWins: 0,
      closeCalls: 0,
    },
    music: {
      played: 0,
      won: 0,
      winRate: "0%",
      avgGuesses: 0,
      currentStreak: 0,
      bestStreak: 0,
      firstTryWins: 0,
      closeCalls: 0,
    },
    location: {
      played: 0,
      won: 0,
      winRate: "0%",
      avgGuesses: 0,
      currentStreak: 0,
      bestStreak: 0,
      firstTryWins: 0,
      closeCalls: 0,
    },
    trivia: {
      played: 0,
      won: 0,
      winRate: "0%",
      avgGuesses: 0,
      currentStreak: 0,
      bestStreak: 0,
      firstTryWins: 0,
      closeCalls: 0,
    },
    crafts: {
      played: 0,
      won: 0,
      winRate: "0%",
      avgGuesses: 0,
      currentStreak: 0,
      bestStreak: 0,
      firstTryWins: 0,
      closeCalls: 0,
    },
    silhouette: {
      played: 0,
      won: 0,
      winRate: "0%",
      avgGuesses: 0,
      currentStreak: 0,
      bestStreak: 0,
      firstTryWins: 0,
      closeCalls: 0,
    }, // NEW
  };

  const [savedStats] = usePersistentStorage("kisekidle-stats", defaultStats);

  const stats = {
    ...defaultStats,
    ...savedStats,
    trivia: savedStats.trivia || defaultStats.trivia,
    crafts: savedStats.crafts || defaultStats.crafts,
    silhouette: savedStats.silhouette || defaultStats.silhouette, // NEW
  };

  const unlockedCount = collection.length;
  const totalChars = CHARACTERS.length;
  const collectionPercentage =
    totalChars > 0 ? Math.round((unlockedCount / totalChars) * 100) : 0;

  const StatBox = ({ label, value }) => (
    <div className="stat-box">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );

  return (
    <div className="profile-container">
      <div className="header-container">
        <h2 className="mode-title">📊 Profile & Stats</h2>
      </div>

      <div className="stats-panel overall">
        <div className="stats-panel-header">🌟 Overall Stats</div>
        <div className="stats-grid">
          <StatBox label="Total Games" value={stats.overall.games} />
          <StatBox label="Total Wins" value={stats.overall.wins} />
          <StatBox label="Overall Win Rate" value={stats.overall.winRate} />
          <StatBox label="Days Active" value={stats.overall.daysActive} />
          <StatBox label="All Games Streak" value={stats.overall.streak} />
          <StatBox label="Perfect Games" value={stats.overall.perfectGames} />
          <StatBox
            label="Collection"
            value={`${unlockedCount}/${totalChars}`}
          />
          <StatBox label="Collection %" value={`${collectionPercentage}%`} />
        </div>
      </div>

      <div className="stats-panel">
        <div className="stats-panel-header">🎭 Character Mode</div>
        <div className="stats-grid">
          <StatBox label="Played" value={stats.character.played} />
          <StatBox label="Won" value={stats.character.won} />
          <StatBox label="Win Rate" value={stats.character.winRate} />
          <StatBox label="Avg. Guesses" value={stats.character.avgGuesses} />
          <StatBox
            label="Current Streak"
            value={stats.character.currentStreak}
          />
          <StatBox label="Best Streak" value={stats.character.bestStreak} />
          <StatBox
            label="First Try Wins"
            value={stats.character.firstTryWins}
          />
          <StatBox label="Close Calls" value={stats.character.closeCalls} />
        </div>
      </div>
      <div className="stats-panel">
        <div className="stats-panel-header">💬 Quote Mode</div>
        <div className="stats-grid">
          <StatBox label="Played" value={stats.quote.played} />
          <StatBox label="Won" value={stats.quote.won} />
          <StatBox label="Win Rate" value={stats.quote.winRate} />
          <StatBox label="Avg. Guesses" value={stats.quote.avgGuesses} />
          <StatBox label="Current Streak" value={stats.quote.currentStreak} />
          <StatBox label="Best Streak" value={stats.quote.bestStreak} />
          <StatBox label="First Try Wins" value={stats.quote.firstTryWins} />
          <StatBox label="Close Calls" value={stats.quote.closeCalls} />
        </div>
      </div>
      <div className="stats-panel">
        <div className="stats-panel-header">🎵 Music Mode</div>
        <div className="stats-grid">
          <StatBox label="Played" value={stats.music.played} />
          <StatBox label="Won" value={stats.music.won} />
          <StatBox label="Win Rate" value={stats.music.winRate} />
          <StatBox label="Avg. Guesses" value={stats.music.avgGuesses} />
          <StatBox label="Current Streak" value={stats.music.currentStreak} />
          <StatBox label="Best Streak" value={stats.music.bestStreak} />
          <StatBox label="First Try Wins" value={stats.music.firstTryWins} />
          <StatBox label="Close Calls" value={stats.music.closeCalls} />
        </div>
      </div>
      <div className="stats-panel">
        <div className="stats-panel-header">📍 Location Mode</div>
        <div className="stats-grid">
          <StatBox label="Played" value={stats.location.played} />
          <StatBox label="Won" value={stats.location.won} />
          <StatBox label="Win Rate" value={stats.location.winRate} />
          <StatBox label="Avg. Guesses" value={stats.location.avgGuesses} />
          <StatBox
            label="Current Streak"
            value={stats.location.currentStreak}
          />
          <StatBox label="Best Streak" value={stats.location.bestStreak} />
          <StatBox label="First Try Wins" value={stats.location.firstTryWins} />
          <StatBox label="Close Calls" value={stats.location.closeCalls} />
        </div>
      </div>

      {version === "new" && (
        <>
          <div className="stats-panel">
            <div className="stats-panel-header">🧠 Trivia Mode</div>
            <div className="stats-grid">
              <StatBox label="Played" value={stats.trivia.played} />
              <StatBox label="Won" value={stats.trivia.won} />
              <StatBox label="Win Rate" value={stats.trivia.winRate} />
              <StatBox label="Avg. Guesses" value={stats.trivia.avgGuesses} />
              <StatBox
                label="Current Streak"
                value={stats.trivia.currentStreak}
              />
              <StatBox label="Best Streak" value={stats.trivia.bestStreak} />
              <StatBox
                label="First Try Wins"
                value={stats.trivia.firstTryWins}
              />
              <StatBox label="Close Calls" value={stats.trivia.closeCalls} />
            </div>
          </div>
          <div className="stats-panel">
            <div className="stats-panel-header">⚔️ Crafts Mode</div>
            <div className="stats-grid">
              <StatBox label="Played" value={stats.crafts.played} />
              <StatBox label="Won" value={stats.crafts.won} />
              <StatBox label="Win Rate" value={stats.crafts.winRate} />
              <StatBox label="Avg. Guesses" value={stats.crafts.avgGuesses} />
              <StatBox
                label="Current Streak"
                value={stats.crafts.currentStreak}
              />
              <StatBox label="Best Streak" value={stats.crafts.bestStreak} />
              <StatBox
                label="First Try Wins"
                value={stats.crafts.firstTryWins}
              />
              <StatBox label="Close Calls" value={stats.crafts.closeCalls} />
            </div>
          </div>

          {/* NEW: Silhouette Mode Stats */}
          <div className="stats-panel">
            <div className="stats-panel-header">👥 Silhouette Mode</div>
            <div className="stats-grid">
              <StatBox label="Played" value={stats.silhouette.played} />
              <StatBox label="Won" value={stats.silhouette.won} />
              <StatBox label="Win Rate" value={stats.silhouette.winRate} />
              <StatBox
                label="Avg. Guesses"
                value={stats.silhouette.avgGuesses}
              />
              <StatBox
                label="Current Streak"
                value={stats.silhouette.currentStreak}
              />
              <StatBox
                label="Best Streak"
                value={stats.silhouette.bestStreak}
              />
              <StatBox
                label="First Try Wins"
                value={stats.silhouette.firstTryWins}
              />
              <StatBox
                label="Close Calls"
                value={stats.silhouette.closeCalls}
              />
            </div>
          </div>
        </>
      )}

      {/* --- COLLECTION GALLERY --- */}
      <div className="header-container" style={{ marginTop: "40px" }}>
        <h2 className="mode-title">📘 Collection</h2>
        <p style={{ color: "#a0a5b5" }}>Characters you've encountered</p>
      </div>

      {GAME_ORDER.map((gameName) => {
        const charsFromGame = CHARACTERS.filter(
          (c) => c.debutGame === gameName
        );
        if (charsFromGame.length === 0) return null;

        const unlockedInGame = charsFromGame.filter((c) =>
          collection.includes(c.id)
        ).length;
        const gamePercentage = Math.round(
          (unlockedInGame / charsFromGame.length) * 100
        );

        return (
          <div key={gameName} className="game-section">
            <h4 className="game-title">
              {gameName}{" "}
              <span style={{ fontSize: "12px", color: "#a0a5b5" }}>
                ({unlockedInGame}/{charsFromGame.length}) - {gamePercentage}%
              </span>
            </h4>
            <div className="collection-grid">
              {charsFromGame.map((char) => {
                const isUnlocked = collection.includes(char.id);
                return (
                  <div
                    key={char.id}
                    className={`char-portrait-box ${
                      isUnlocked ? "unlocked" : ""
                    }`}
                  >
                    {isUnlocked ? (
                      <>
                        <img
                          src={char.imageUrl}
                          alt={char.name}
                          className="char-image"
                          onError={(e) => {
                            e.target.style.display = "none";
                            e.target.parentElement.innerHTML =
                              '<span style="font-size:10px;text-align:center;padding:5px;">Image Missing</span>';
                          }}
                        />
                        <div className="char-name-label">{char.name}</div>
                      </>
                    ) : (
                      <div className="locked-question-mark">?</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ==========================================
// 11. SETTINGS / DATA IMPORT & EXPORT
// ==========================================
function SettingsModal({ onClose }) {
  const handleExport = () => {
    const saveData = {
      chars: localStorage.getItem("kisekidle-chars"),
      quotes: localStorage.getItem("kisekidle-quotes"),
      music: localStorage.getItem("kisekidle-music"),
      locations: localStorage.getItem("kisekidle-locations"),
      trivia: localStorage.getItem("kisekidle-trivia"),
      crafts: localStorage.getItem("kisekidle-crafts"),
      silhouette: localStorage.getItem("kisekidle-silhouette"), // NEW
      collection: localStorage.getItem("kisekidle-collection"),
      stats: localStorage.getItem("kisekidle-stats"),
    };

    const blob = new Blob([JSON.stringify(saveData)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "kisekidle_backup.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (data.chars) localStorage.setItem("kisekidle-chars", data.chars);
        if (data.quotes) localStorage.setItem("kisekidle-quotes", data.quotes);
        if (data.music) localStorage.setItem("kisekidle-music", data.music);
        if (data.locations)
          localStorage.setItem("kisekidle-locations", data.locations);
        if (data.trivia) localStorage.setItem("kisekidle-trivia", data.trivia);
        if (data.crafts) localStorage.setItem("kisekidle-crafts", data.crafts);
        if (data.silhouette)
          localStorage.setItem("kisekidle-silhouette", data.silhouette); // NEW
        if (data.collection)
          localStorage.setItem("kisekidle-collection", data.collection);
        if (data.stats) localStorage.setItem("kisekidle-stats", data.stats);

        alert("Data imported successfully! The page will now reload.");
        window.location.reload();
      } catch (err) {
        alert(
          "Failed to import. Please make sure this is a valid Kisekidle backup file."
        );
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          ✖
        </button>
        <h2 style={{ color: "#e0e6f8", marginBottom: "20px" }}>⚙️ Settings</h2>
        <p style={{ color: "#a0a5b5", fontSize: "14px", marginBottom: "20px" }}>
          Transfer your stats and collection to another browser or device.
        </p>
        <button className="import-export-btn" onClick={handleExport}>
          📥 Download Backup (.json)
        </button>
        <label
          className="import-export-btn"
          style={{ display: "inline-block", boxSizing: "border-box" }}
        >
          📤 Import Backup
          <input
            type="file"
            accept=".json"
            style={{ display: "none" }}
            onChange={handleImport}
          />
        </label>
      </div>
    </div>
  );
}

// ==========================================
// 12. NEW VERSION INFO MODAL
// ==========================================
function NewVersionModal({ onClose, onConfirmDoNotShow }) {
  const [dontShow, setDontShow] = useState(false);
  const handleClose = () => {
    if (dontShow) onConfirmDoNotShow();
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={handleClose}>
          ✖
        </button>
        <h2 style={{ color: "#e0e6f8", marginBottom: "15px" }}>
          ✨ New Version
        </h2>
        <div
          style={{
            color: "#a0a5b5",
            fontSize: "14px",
            lineHeight: "1.5",
            textAlign: "left",
            marginBottom: "20px",
          }}
        >
          <p style={{ marginBottom: "10px" }}>
            Welcome to the expanded Kisekidle! This version includes:
          </p>
          <ul
            style={{
              paddingLeft: "20px",
              marginBottom: "15px",
              listStyleType: "disc",
              color: "#e0e6f8",
            }}
          >
            <li style={{ marginBottom: "8px" }}>
              <strong>Three New Modes:</strong> Test your Zemurian knowledge in
              🧠 Trivia, ⚔️ Crafts, and 👥 Silhouettes.
            </li>
            <li>
              <strong>Expanded Data:</strong> All game modes now include
              characters, quotes, and music from{" "}
              <em>Kai no Kiseki: Farewell, O Zemuria</em> (Horizon).
            </li>
          </ul>
          <p
            style={{
              color: "#ff4d4d",
              fontSize: "12px",
              fontStyle: "italic",
              textAlign: "center",
            }}
          >
            ⚠️ Warning: This mode contains spoilers for the newest entries in
            the Trails series!
          </p>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "10px",
            marginBottom: "20px",
          }}
        >
          <input
            type="checkbox"
            id="dontShowAgain"
            checked={dontShow}
            onChange={(e) => setDontShow(e.target.checked)}
            style={{
              cursor: "pointer",
              width: "16px",
              height: "16px",
              accentColor: "#4d88ff",
            }}
          />
          <label
            htmlFor="dontShowAgain"
            style={{ color: "#a0a5b5", fontSize: "12px", cursor: "pointer" }}
          >
            Don't show this popup again
          </label>
        </div>
        <button
          className="submit-button"
          onClick={handleClose}
          style={{ width: "100%", margin: 0 }}
        >
          Got it!
        </button>
      </div>
    </div>
  );
}

// ==========================================
// CALENDAR ARCHIVE MODE (WITH WIN/LOSS DOTS)
// ==========================================
function ArchiveMode({ onSelectDate }) {
  const today = new Date();
  const todayYear = today.getUTCFullYear();
  const todayMonth = today.getUTCMonth();
  const todayDate = today.getUTCDate();

  const [viewYear, setViewYear] = useState(todayYear);
  const [viewMonth, setViewMonth] = useState(todayMonth);
  const epochDate = new Date("2024-01-01T00:00:00Z");

  // UPDATED: Now includes Silhouette Mode
  const PUZZLES = [
    { key: "kisekidle-chars", data: CHARACTERS, max: 8 },
    { key: "kisekidle-quotes", data: QUOTES, max: 5 },
    { key: "kisekidle-music", data: MUSIC, max: 5 },
    { key: "kisekidle-locations", data: LOCATIONS, max: 5 },
    { key: "kisekidle-trivia", data: TRIVIA, max: 2 },
    { key: "kisekidle-crafts", data: CRAFTS, max: 6 },
    { key: "kisekidle-silhouette", data: SILHOUETTES, max: 5 }, // NEW
  ];

  const getDayStatuses = (dateObj) => {
    return PUZZLES.map((puzzle) => {
      const targetDateStr = getDateString(dateObj);
      const currentTodayStr = getTodayString();
      const isToday = targetDateStr === currentTodayStr;

      const storageKey = isToday
        ? puzzle.key
        : `${puzzle.key}-${targetDateStr}`;
      const storedData = localStorage.getItem(storageKey);

      if (!storedData) return "unplayed";

      try {
        const parsed = JSON.parse(storedData);
        const guesses = parsed.guesses || [];
        if (guesses.length === 0) return "unplayed";

        const targetItem = getDailyItem(puzzle.data, dateObj);
        const targetValues = Object.values(targetItem).map((v) =>
          String(v).toLowerCase()
        );

        const isWin = guesses.some((guess) => {
          if (typeof guess === "string") {
            return targetValues.includes(guess.toLowerCase());
          } else if (guess && typeof guess === "object") {
            const gName = guess.name ? String(guess.name).toLowerCase() : null;
            const gId = guess.id ? String(guess.id).toLowerCase() : null;
            const gChar = guess.character
              ? String(guess.character).toLowerCase()
              : null;
            return (
              targetValues.includes(gName) ||
              targetValues.includes(gId) ||
              targetValues.includes(gChar)
            );
          }
          return false;
        });

        if (isWin) return "win";
        if (guesses.length >= puzzle.max) return "loss";
        return "partial";
      } catch (e) {
        return "unplayed";
      }
    });
  };

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((prev) => prev - 1);
    } else {
      setViewMonth((prev) => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((prev) => prev + 1);
    } else {
      setViewMonth((prev) => prev + 1);
    }
  };

  const daysInMonth = new Date(
    Date.UTC(viewYear, viewMonth + 1, 0)
  ).getUTCDate();
  const firstDayOfWeek = new Date(Date.UTC(viewYear, viewMonth, 1)).getUTCDay();

  const blanks = Array.from({ length: firstDayOfWeek }, (_, i) => i);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  return (
    <div className="archive-container">
      <div className="header-container">
        <h2 className="mode-title">📅 Daily Archive</h2>
        <p style={{ color: "#a0a5b5", marginBottom: "20px" }}>
          Select a past date to replay missed puzzles.
        </p>
      </div>

      <div className="calendar-wrapper">
        <div className="calendar-header">
          <button
            className="calendar-nav-btn"
            onClick={handlePrevMonth}
            disabled={viewYear === 2024 && viewMonth === 0}
          >
            ◀
          </button>
          <h3>
            {monthNames[viewMonth]} {viewYear}
          </h3>
          <button
            className="calendar-nav-btn"
            onClick={handleNextMonth}
            disabled={viewYear === todayYear && viewMonth === todayMonth}
          >
            ▶
          </button>
        </div>

        <div className="calendar-grid">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div key={day} className="calendar-day-label">
              {day}
            </div>
          ))}
          {blanks.map((blank) => (
            <div key={`blank-${blank}`} className="calendar-empty-slot"></div>
          ))}

          {days.map((day) => {
            const currentCellDate = new Date(
              Date.UTC(viewYear, viewMonth, day)
            );
            const isBeforeEpoch = currentCellDate < epochDate;
            const isFuture =
              viewYear > todayYear ||
              (viewYear === todayYear && viewMonth > todayMonth) ||
              (viewYear === todayYear &&
                viewMonth === todayMonth &&
                day > todayDate);
            const isTodayCell =
              viewYear === todayYear &&
              viewMonth === todayMonth &&
              day === todayDate;
            const isDisabled = isBeforeEpoch || isFuture || isTodayCell;

            const statuses =
              isBeforeEpoch || isFuture ? [] : getDayStatuses(currentCellDate);
            const hasAnyPlays = statuses.some((s) => s !== "unplayed");

            return (
              <button
                key={day}
                className={`calendar-day-btn ${
                  isTodayCell ? "calendar-today" : ""
                }`}
                disabled={isDisabled}
                onClick={() => onSelectDate(currentCellDate)}
                title={
                  isTodayCell ? "Play Today's Puzzle on the main tab!" : ""
                }
              >
                <span className="calendar-day-text">{day}</span>
                {hasAnyPlays && (
                  <div className="calendar-dots-grid">
                    {statuses.map((status, idx) => (
                      <span
                        key={idx}
                        className={`calendar-dot dot-${status}`}
                        title={`Mode: ${PUZZLES[idx].key}`}
                      ></span>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ==========================================
// MAIN APP (Navigation & State)
// ==========================================
export default function App() {
  const [activeTab, setActiveTab] = useState("characters");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [appVersion, setAppVersion] = useState("legacy");
  const [hasSeenVersionModal, setHasSeenVersionModal] = usePersistentStorage(
    "kisekidle-seen-new-version",
    false
  );
  const [showNewVersionModal, setShowNewVersionModal] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [targetDateObj, setTargetDateObj] = useState(null);
  const activeDateObj = targetDateObj || new Date();
  const activeDateStr = getDateString(activeDateObj);
  const isArchive = targetDateObj !== null;

  const handleReturnToToday = () => {
    setTargetDateObj(null);
    setActiveTab("characters");
  };

  const handleAdminReset = () => {
    localStorage.removeItem("kisekidle-chars");
    localStorage.removeItem("kisekidle-quotes");
    localStorage.removeItem("kisekidle-music");
    localStorage.removeItem("kisekidle-locations");
    localStorage.removeItem("kisekidle-trivia");
    localStorage.removeItem("kisekidle-crafts");
    localStorage.removeItem("kisekidle-silhouette"); // NEW
    localStorage.removeItem("kisekidle-seen-new-version");
    window.location.reload();
  };

  const handleVersionSwitch = (version) => {
    setAppVersion(version);
    if (version === "new" && !hasSeenVersionModal) {
      setShowNewVersionModal(true);
    }
    // Boot them back to the character tab if they are currently on a new mode and switch back to legacy
    if (
      version === "legacy" &&
      (activeTab === "trivia" ||
        activeTab === "crafts" ||
        activeTab === "silhouette")
    ) {
      setActiveTab("characters");
    }
  };

  return (
    <div className="app-container">
      <button className="settings-btn" onClick={() => setIsSettingsOpen(true)}>
        ⚙️
      </button>

      {isSettingsOpen && (
        <SettingsModal onClose={() => setIsSettingsOpen(false)} />
      )}

      {showNewVersionModal && (
        <NewVersionModal
          onClose={() => setShowNewVersionModal(false)}
          onConfirmDoNotShow={() => setHasSeenVersionModal(true)}
        />
      )}

      {/* Left Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-title">KISEKIDLE</div>

        <div className="version-toggle-container">
          <button
            className={`version-btn ${appVersion === "legacy" ? "active" : ""}`}
            onClick={() => handleVersionSwitch("legacy")}
          >
            Legacy
          </button>
          <button
            className={`version-btn ${appVersion === "new" ? "active" : ""}`}
            onClick={() => handleVersionSwitch("new")}
          >
            New Version
          </button>
        </div>

        <nav className="sidebar-nav">
          <button
            className={`nav-button ${
              activeTab === "characters" ? "active" : ""
            }`}
            onClick={() => setActiveTab("characters")}
          >
            <span>🎭</span> Character
          </button>
          <button
            className={`nav-button ${activeTab === "quotes" ? "active" : ""}`}
            onClick={() => setActiveTab("quotes")}
          >
            <span>💬</span> Quote
          </button>
          <button
            className={`nav-button ${activeTab === "music" ? "active" : ""}`}
            onClick={() => setActiveTab("music")}
          >
            <span>🎵</span> Music
          </button>
          <button
            className={`nav-button ${
              activeTab === "locations" ? "active" : ""
            }`}
            onClick={() => setActiveTab("locations")}
          >
            <span>📍</span> Location
          </button>

          {/* New Modes Only Show in 'New Version' */}
          {appVersion === "new" && (
            <>
              <div
                style={{
                  height: "1px",
                  backgroundColor: "#2d3446",
                  margin: "10px 20px",
                }}
              ></div>
              <button
                className={`nav-button ${
                  activeTab === "trivia" ? "active" : ""
                }`}
                onClick={() => setActiveTab("trivia")}
              >
                <span>🧠</span> Trivia
              </button>
              <button
                className={`nav-button ${
                  activeTab === "crafts" ? "active" : ""
                }`}
                onClick={() => setActiveTab("crafts")}
              >
                <span>⚔️</span> Crafts
              </button>
              {/* NEW: Silhouette Sidebar Button */}
              <button
                className={`nav-button ${
                  activeTab === "silhouette" ? "active" : ""
                }`}
                onClick={() => setActiveTab("silhouette")}
              >
                <span>👥</span> Silhouettes
              </button>
            </>
          )}

          <div
            style={{
              height: "1px",
              backgroundColor: "#2d3446",
              margin: "10px 20px",
            }}
          ></div>
          <button
            className={`nav-button ${activeTab === "results" ? "active" : ""}`}
            onClick={() => setActiveTab("results")}
          >
            <span>🏆</span> Today's Results
          </button>
          <button
            className={`nav-button ${activeTab === "profile" ? "active" : ""}`}
            onClick={() => setActiveTab("profile")}
          >
            <span>👤</span> Profile
          </button>
          <button
            className={`nav-button ${activeTab === "archive" ? "active" : ""}`}
            onClick={() => setActiveTab("archive")}
          >
            <span>📅</span> Day Replay
          </button>
        </nav>

        <CountdownTimer />

        <div
          style={{
            padding: "15px",
            textAlign: "center",
            backgroundColor: "#161a24",
          }}
        >
          <button
            onClick={handleAdminReset}
            style={{
              backgroundColor: "transparent",
              color: "#ff4d4d",
              border: "1px solid #ff4d4d",
              padding: "8px",
              borderRadius: "4px",
              cursor: "pointer",
              width: "100%",
              fontWeight: "bold",
              fontSize: "12px",
            }}
          >
            ⚠️ Admin Reset
          </button>
        </div>
      </aside>

      {/* Main Game Area */}
      <main className="main-content">
        {isArchive && (
          <div className="archive-banner">
            ⚠️ You are playing an archived puzzle from {activeDateStr} ⚠️
            <button
              className="archive-return-btn"
              onClick={handleReturnToToday}
            >
              Return to Today
            </button>
          </div>
        )}

        {activeTab === "characters" && (
          <CharacterMode
            key={activeDateStr}
            version={appVersion}
            targetDateObj={activeDateObj}
            targetDateStr={activeDateStr}
            isArchive={isArchive}
            setIsModalOpen={setIsModalOpen}
          />
        )}
        {activeTab === "quotes" && (
          <QuoteMode
            key={activeDateStr}
            version={appVersion}
            targetDateObj={activeDateObj}
            targetDateStr={activeDateStr}
            isArchive={isArchive}
            setIsModalOpen={setIsModalOpen}
          />
        )}
        {activeTab === "music" && (
          <MusicMode
            key={activeDateStr}
            version={appVersion}
            targetDateObj={activeDateObj}
            targetDateStr={activeDateStr}
            isArchive={isArchive}
            setIsModalOpen={setIsModalOpen}
          />
        )}
        {activeTab === "locations" && (
          <LocationMode
            key={activeDateStr}
            version={appVersion}
            targetDateObj={activeDateObj}
            targetDateStr={activeDateStr}
            isArchive={isArchive}
            setIsModalOpen={setIsModalOpen}
          />
        )}

        {/* New Modes */}
        {activeTab === "trivia" && (
          <TriviaMode
            key={activeDateStr}
            version={appVersion}
            targetDateObj={activeDateObj}
            targetDateStr={activeDateStr}
            isArchive={isArchive}
            setIsModalOpen={setIsModalOpen}
          />
        )}
        {activeTab === "crafts" && (
          <CraftsMode
            key={activeDateStr}
            version={appVersion}
            targetDateObj={activeDateObj}
            targetDateStr={activeDateStr}
            isArchive={isArchive}
            setIsModalOpen={setIsModalOpen}
          />
        )}
        {/* NEW: Silhouette Router Switch */}
        {activeTab === "silhouette" && (
          <SilhouetteMode
            key={activeDateStr}
            version={appVersion}
            targetDateObj={activeDateObj}
            targetDateStr={activeDateStr}
            isArchive={isArchive}
            setIsModalOpen={setIsModalOpen}
          />
        )}

        {activeTab === "results" && (
          <ResultsMode
            key={activeDateStr}
            version={appVersion}
            targetDateObj={activeDateObj}
            targetDateStr={activeDateStr}
            isArchive={isArchive}
          />
        )}
        {activeTab === "archive" && (
          <ArchiveMode
            onSelectDate={(date) => {
              setTargetDateObj(date);
              setActiveTab("characters");
            }}
          />
        )}
        {activeTab === "profile" && <ProfileMode version={appVersion} />}
      </main>
      {isModalOpen && (
        <GlobalStatsModal
          targetDateStr={activeDateStr}
          onClose={() => setIsModalOpen(false)}
        />
      )}
    </div>
  );
}
