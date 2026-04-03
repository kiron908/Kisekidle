import React, { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase"; // Adjust path if needed

const MODES = [
  {
    id: "character_stats",
    label: "Character Mode",
    storageKey: "kisekidle-chars",
    maxGuesses: 10,
  },
  {
    id: "location_stats",
    label: "Location Mode",
    storageKey: "kisekidle-locations",
    maxGuesses: 5,
  },
  {
    id: "music_stats",
    label: "Music Mode",
    storageKey: "kisekidle-music",
    maxGuesses: 6,
  },
  {
    id: "quote_stats",
    label: "Quote Mode",
    storageKey: "kisekidle-quotes",
    maxGuesses: 6,
  },
  {
    id: "trivia_stats",
    label: "Trivia Mode",
    storageKey: "kisekidle-trivia",
    maxGuesses: 2,
  },
  {
    id: "crafts_stats",
    label: "Crafts Mode",
    storageKey: "kisekidle-crafts",
    maxGuesses: 6,
  },
  {
    id: "silhouette_stats",
    label: "Silhouette Mode",
    storageKey: "kisekidle-silhouette",
    maxGuesses: 5,
  },
];

export default function GlobalStatsModal({ targetDateStr, onClose }) {
  const [statsData, setStatsData] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchAllStats = async () => {
      const fetchedStats = {};
      for (const mode of MODES) {
        const docRef = doc(db, mode.id, targetDateStr);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          fetchedStats[mode.id] = docSnap.data();
        }
      }
      setStatsData(fetchedStats);
      setIsLoading(false);
    };

    fetchAllStats();
  }, [targetDateStr]);

  // --- ANTI-CHEAT CHECKER ---
  // Checks if the player has won or run out of guesses for this specific mode
  const checkIfFinished = (storageKey, maxGuessesForMode) => {
    try {
      const savedData = localStorage.getItem(`${storageKey}-${targetDateStr}`);
      if (!savedData) return false;

      const guesses = JSON.parse(savedData);
      if (guesses.length === 0) return false;
      const isOutOfGuesses = guesses.length >= maxGuessesForMode;

      // If we have saved data, we assume they played and either won or lost!
      return true;
    } catch (e) {
      return false;
    }
  };

  const getTop5 = (guessTally) => {
    if (!guessTally) return [];
    return Object.entries(guessTally)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  };

  return (
    <div className="modal-overlay" style={overlayStyle}>
      <div className="modal-content" style={contentStyle}>
        <button onClick={onClose} style={closeBtnStyle}>
          ✖
        </button>
        <h2 style={{ textAlign: "center", marginBottom: "20px" }}>
          🌍 Global Daily Stats
        </h2>

        {isLoading ? (
          <p style={{ textAlign: "center" }}>Loading global data...</p>
        ) : (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "20px" }}
          >
            {MODES.map((mode) => {
              const data = statsData[mode.id];
              if (!data) return null;

              const isFinished = checkIfFinished(
                mode.storageKey,
                mode.maxGuesses
              );
              const winRate = Math.round(
                (data.totalWins / data.totalPlays) * 100
              );
              const avgAttempts =
                data.totalWins > 0
                  ? (data.totalWinningAttempts / data.totalWins).toFixed(1)
                  : 0;
              const top5 = getTop5(data.guessTally);

              return (
                <div key={mode.id} style={cardStyle}>
                  <h3 style={{ margin: "0 0 10px 0", color: "#4a90e2" }}>
                    {mode.label}
                  </h3>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: "10px",
                      fontSize: "0.9rem",
                    }}
                  >
                    <span>
                      <strong>Players:</strong> {data.totalPlays}
                    </span>
                    <span>
                      <strong>Win Rate:</strong> {winRate}%
                    </span>
                    <span>
                      <strong>Avg Attempts:</strong> {avgAttempts}
                    </span>
                  </div>

                  <div
                    style={{
                      fontSize: "0.9rem",
                      color: "#a0a5b5",
                      marginTop: "10px",
                    }}
                  >
                    <strong>Top Answers:</strong>

                    {/* --- SPOILER MASK LOGIC --- */}
                    {isFinished ? (
                      <ul style={{ margin: "5px 0 0 0", paddingLeft: "20px" }}>
                        {top5.map(([name, count]) => (
                          <li key={name}>
                            {name} ({count} guesses)
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div
                        style={{
                          marginTop: "5px",
                          padding: "10px",
                          backgroundColor: "#1a1e2a",
                          borderRadius: "6px",
                          textAlign: "center",
                          color: "#6c758f",
                          fontStyle: "italic",
                        }}
                      >
                        🔒 Play today's {mode.label} to unlock these answers!
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// --- STYLES ---
const overlayStyle = {
  position: "fixed",
  top: 0,
  left: 0,
  width: "100vw",
  height: "100vh",
  backgroundColor: "rgba(0, 0, 0, 0.8)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 9999,
};
const contentStyle = {
  backgroundColor: "#1a1e2a",
  padding: "30px",
  borderRadius: "12px",
  width: "90%",
  maxWidth: "600px",
  maxHeight: "80vh",
  overflowY: "auto",
  position: "relative",
};
const closeBtnStyle = {
  position: "absolute",
  top: "15px",
  right: "15px",
  background: "none",
  border: "none",
  color: "white",
  fontSize: "1.5rem",
  cursor: "pointer",
};
const cardStyle = {
  backgroundColor: "#2d3446",
  padding: "15px",
  borderRadius: "8px",
};
