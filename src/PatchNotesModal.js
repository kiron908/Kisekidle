import React from "react";

const PATCHES = [
  {
    version: "v1.0.0",
    date: "May 15, 2024",
    notes: ["🎉 Welcome to the official launch of the revived Kisekidle!"],
  },
];

export default function PatchNotesModal({ onClose }) {
  return (
    // 1. Add onClose to the overlay
    <div className="modal-overlay" style={overlayStyle} onClick={onClose}>
      {/* 2. Block the click on the content */}
      <div
        className="modal-content"
        style={contentStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} style={closeBtnStyle}>
          ✖
        </button>
        <h2 style={{ textAlign: "center", marginBottom: "20px" }}>
          📝 Patch Notes
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
          {PATCHES.map((patch, index) => (
            <div key={index} style={cardStyle}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  marginBottom: "10px",
                }}
              >
                <h3 style={{ margin: 0, color: "#4a90e2" }}>{patch.version}</h3>
                <span style={{ fontSize: "0.85rem", color: "#a0a5b5" }}>
                  {patch.date}
                </span>
              </div>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: "20px",
                  fontSize: "0.95rem",
                  color: "#e0e6f8",
                }}
              >
                {patch.notes.map((note, i) => (
                  <li key={i} style={{ marginBottom: "5px" }}>
                    {note}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
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
  maxWidth: "500px",
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
