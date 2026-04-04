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
    id: "quote_stats",
    label: "Quote Mode",
    storageKey: "kisekidle-quotes",
    maxGuesses: 6,
  },
  {
    id: "music_stats",
    label: "Music Mode",
    storageKey: "kisekidle-music",
    maxGuesses: 6,
  },
  {
    id: "location_stats",
    label: "Location Mode",
    storageKey: "kisekidle-locations",
    maxGuesses: 5,
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

  // --- UPGRADED ANTI-CHEAT CHECKER ---
  const checkIfFinished = (storageKey, maxGuessesForMode) => {
    try {
      // 1. Try to find the data with the date attached (Pattern A)
      let savedData = localStorage.getItem(`${storageKey}-${targetDateStr}`);

      // 2. Try to find the data WITHOUT the date attached (Pattern B)
      if (!savedData) {
        savedData = localStorage.getItem(storageKey);
      }

      // DEBUGGING: This will print exactly what it finds to your console!
      //console.log(`[Modal Check] Mode: ${storageKey} | Found Data:`, savedData);

      // If absolutely nothing is found, keep it locked.
      if (!savedData) return false;

      const parsedData = JSON.parse(savedData);

      // 3. Extract the array of guesses (Handles both arrays and objects)
      let guesses = [];
      if (Array.isArray(parsedData)) {
        guesses = parsedData;
      } else if (parsedData && Array.isArray(parsedData.guesses)) {
        guesses = parsedData.guesses;
      }

      // If the array is empty, they haven't guessed yet. Keep it locked.
      if (guesses.length === 0) return false;

      // If we made it here, they have played today! Unlock the stats.
      return true;
    } catch (e) {
      console.error("Anti-cheat check failed:", e);
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
              // Safely grab the data, or provide an empty template if nobody has played today!
              const data = statsData[mode.id] || {
                totalPlays: 0,
                totalWins: 0,
                totalWinningAttempts: 0,
                guessTally: {},
              };

              const isFinished = checkIfFinished(
                mode.storageKey,
                mode.maxGuesses
              );

              // Prevent dividing by zero errors!
              const winRate =
                data.totalPlays > 0
                  ? Math.round((data.totalWins / data.totalPlays) * 100)
                  : 0;
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
                    <strong>Most Common Guesses:</strong>

                    {/* --- SPOILER MASK LOGIC --- */}
                    {isFinished ? (
                      top5.length > 0 ? (
                        // 1. Removed padding and default bullet points
                        <ul style={{ margin: "10px 0 0 0", padding: 0 }}>
                          {top5.map(([name, count]) => {
                            // 2. Calculate percentage based on the TOTAL PLAYERS today
                            const percent =
                              data.totalPlays > 0
                                ? Math.round((count / data.totalPlays) * 100)
                                : 0;

                            // 3. Dynamic colors! Green for popular, Yellow/Orange for medium, Blue for rare
                            const barColor =
                              percent >= 70
                                ? "#4CAF50"
                                : percent >= 50
                                ? "#FF9800"
                                : "#4a90e2";

                            return (
                              <li
                                key={name}
                                style={{
                                  position: "relative", // Required so the bar stays inside the box
                                  marginBottom: "8px",
                                  padding: "6px 12px",
                                  borderRadius: "6px",
                                  backgroundColor: "#1a1e2a", // Dark gray base
                                  listStyleType: "none",
                                  display: "flex",
                                  justifyContent: "space-between",
                                  zIndex: 1,
                                  overflow: "hidden",
                                }}
                              >
                                {/* --- THE DYNAMIC PROGRESS BAR --- */}
                                <div
                                  style={{
                                    position: "absolute",
                                    top: 0,
                                    left: 0,
                                    height: "100%",
                                    width: `${percent}%`, // Fills the box based on the %
                                    backgroundColor: barColor,
                                    opacity: 0.3, // Keeps it transparent so text is easily readable
                                    zIndex: -1, // Puts it behind the text
                                    transition: "width 0.5s ease-out", // Smooth animation when it loads!
                                  }}
                                />

                                {/* The Text */}
                                <span
                                  style={{
                                    fontWeight: "bold",
                                    color: "#e0e6f8",
                                    zIndex: 2,
                                  }}
                                >
                                  {name}
                                </span>
                                <span
                                  style={{
                                    color: "#a0a5b5",
                                    fontSize: "0.85rem",
                                    zIndex: 2,
                                  }}
                                >
                                  {count}{" "}
                                  <span style={{ opacity: 0.7 }}>
                                    ({percent}%)
                                  </span>
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <div
                          style={{
                            marginTop: "5px",
                            color: "#6c758f",
                            fontStyle: "italic",
                          }}
                        >
                          No specific guesses recorded yet!
                        </div>
                      )
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
