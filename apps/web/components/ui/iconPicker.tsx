"use client";

import { useState, useMemo } from "react";
import { X } from "lucide-react";
import styles from "./iconPicker.module.css";

interface GameIcon {
  emoji: string;
  name: string;
  category: string;
}

const icons: GameIcon[] = [
  // Kártyák
  { emoji: "🃏", name: "Joker", category: "Kártyák" },
  { emoji: "♠️", name: "Pikk", category: "Kártyák" },
  { emoji: "♥️", name: "Kőr", category: "Kártyák" },
  { emoji: "♦️", name: "Káró", category: "Kártyák" },
  { emoji: "♣️", name: "Treff", category: "Kártyák" },
  { emoji: "🀄", name: "Mahjong", category: "Kártyák" },
  { emoji: "🎴", name: "Hanafuda", category: "Kártyák" },
  // Sport
  { emoji: "🎯", name: "Darts", category: "Sport" },
  { emoji: "🎾", name: "Tenisz", category: "Sport" },
  { emoji: "⛳", name: "Golf", category: "Sport" },
  { emoji: "🏓", name: "Pingpong", category: "Sport" },
  { emoji: "🎱", name: "Biliárd", category: "Sport" },
  { emoji: "🏸", name: "Tollas", category: "Sport" },
  { emoji: "🥊", name: "Box", category: "Sport" },
  // Táblás
  { emoji: "♟️", name: "Sakk", category: "Táblás" },
  { emoji: "🎲", name: "Kocka", category: "Táblás" },
  { emoji: "🎭", name: "Társas", category: "Táblás" },
  { emoji: "🌿", name: "Mocsár", category: "Táblás" },
  { emoji: "🚂", name: "Vasút", category: "Táblás" },
  { emoji: "⬜", name: "Quoridor", category: "Táblás" },
  { emoji: "🐄", name: "Kuhhandel", category: "Táblás" },
  // Szerencse
  { emoji: "🌀", name: "Frantic", category: "Szerencse" },
  { emoji: "🐂", name: "Ökrös", category: "Szerencse" },
  { emoji: "🎰", name: "Jackpot", category: "Szerencse" },
  { emoji: "🎡", name: "Szerencsekerék", category: "Szerencse" },
  { emoji: "🏆", name: "Trófea", category: "Szerencse" },
  { emoji: "🎮", name: "Kontroller", category: "Szerencse" },
  { emoji: "🔮", name: "Kristálygömb", category: "Szerencse" },
  { emoji: "🧩", name: "Puzzle", category: "Szerencse" },
  { emoji: "⚔️", name: "Kard", category: "Szerencse" },
  { emoji: "🎪", name: "Cirkusz", category: "Szerencse" },
  { emoji: "🌊", name: "Hullám", category: "Szerencse" },
  { emoji: "🏔️", name: "Hegy", category: "Szerencse" },
];

const categories = ["Mind", "Kártyák", "Sport", "Táblás", "Szerencse"];

export default function IconPicker({
  open,
  onClose,
  value,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  value: string;
  onChange: (emoji: string, name: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("Mind");

  const filtered = useMemo(() => {
    let list = icons;
    if (activeCategory !== "Mind") {
      list = list.filter((i) => i.category === activeCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((i) => i.name.toLowerCase().includes(q));
    }
    return list;
  }, [search, activeCategory]);

  const selected = icons.find((i) => i.emoji === value);

  if (!open) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.backdrop} onClick={onClose} />
      <div className={styles.popup}>
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.title}>Válassz ikont</h2>
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        {/* Search */}
        <input
          className={styles.search}
          type="text"
          placeholder="Keresés..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />

        {/* Categories */}
        <div className={styles.categories}>
          {categories.map((cat) => (
            <button
              key={cat}
              className={`${styles.catBtn} ${activeCategory === cat ? styles.catActive : ""}`}
              onClick={() => setActiveCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Grid */}
        <div className={styles.grid}>
          {filtered.map((icon) => (
            <button
              key={icon.emoji + icon.name}
              className={`${styles.iconBtn} ${value === icon.emoji ? styles.iconActive : ""}`}
              onClick={() => onChange(icon.emoji, icon.name)}
              title={icon.name}
            >
              {icon.emoji}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className={styles.empty}>Nincs találat</div>
          )}
        </div>

        {/* Footer: selected preview */}
        <div className={styles.footer}>
          <div className={styles.preview}>
            <span className={styles.previewIcon}>{value || "?"}</span>
            <span className={styles.previewName}>
              {selected?.name ?? "Nincs kiválasztva"}
            </span>
          </div>
          <button
            className={styles.selectBtn}
            onClick={onClose}
            disabled={!value}
          >
            ✓ Kiválaszt
          </button>
        </div>
      </div>
    </div>
  );
}
