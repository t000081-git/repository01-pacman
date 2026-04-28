// 28 columns x 31 rows classic Pac-Man maze layout.
// Legend:
//   '#' wall
//   '.' dot (pellet)
//   'o' power pellet
//   ' ' open path (no dot)
//   '-' ghost-house door (passable only by ghosts)
//   'P' pac-man spawn (treated as open path)
//   'G' ghost spawn (treated as open path)

export const MAZE_RAW: string[] = [
  "############################",
  "#............##............#",
  "#.####.#####.##.#####.####.#",
  "#o####.#####.##.#####.####o#",
  "#.####.#####.##.#####.####.#",
  "#..........................#",
  "#.####.##.########.##.####.#",
  "#.####.##.########.##.####.#",
  "#......##....##....##......#",
  "######.##### ## #####.######",
  "     #.##### ## #####.#     ",
  "     #.##          ##.#     ",
  "     #.## ###--### ##.#     ",
  "######.## #GG  GG# ##.######",
  "      .   #      #   .      ",
  "######.## ######## ##.######",
  "     #.## ######## ##.#     ",
  "     #.##          ##.#     ",
  "     #.## ######## ##.#     ",
  "######.## ######## ##.######",
  "#............##............#",
  "#.####.#####.##.#####.####.#",
  "#.####.#####.##.#####.####.#",
  "#o..##.......P .......##..o#",
  "###.##.##.########.##.##.###",
  "###.##.##.########.##.##.###",
  "#......##....##....##......#",
  "#.##########.##.##########.#",
  "#.##########.##.##########.#",
  "#..........................#",
  "############################",
];

export const COLS = MAZE_RAW[0].length; // 28
export const ROWS = MAZE_RAW.length; // 31

export type TileKind = "wall" | "dot" | "power" | "empty" | "door";

export interface MazeData {
  tiles: TileKind[][]; // [y][x]
  pacmanSpawn: { x: number; y: number };
  ghostSpawns: { x: number; y: number }[];
  totalDots: number;
}

export function parseMaze(): MazeData {
  const tiles: TileKind[][] = [];
  let pacmanSpawn = { x: 13, y: 23 };
  const ghostSpawns: { x: number; y: number }[] = [];
  let totalDots = 0;

  for (let y = 0; y < ROWS; y++) {
    const row: TileKind[] = [];
    const line = MAZE_RAW[y];
    for (let x = 0; x < COLS; x++) {
      const c = line[x];
      switch (c) {
        case "#":
          row.push("wall");
          break;
        case ".":
          row.push("dot");
          totalDots++;
          break;
        case "o":
          row.push("power");
          totalDots++;
          break;
        case "-":
          row.push("door");
          break;
        case "P":
          pacmanSpawn = { x, y };
          row.push("empty");
          break;
        case "G":
          ghostSpawns.push({ x, y });
          row.push("empty");
          break;
        default:
          row.push("empty");
      }
    }
    tiles.push(row);
  }

  // Ensure four ghost spawns exist; if maze missed them, derive defaults.
  while (ghostSpawns.length < 4) {
    ghostSpawns.push({ x: 13 + ghostSpawns.length, y: 13 });
  }

  return { tiles, pacmanSpawn, ghostSpawns, totalDots };
}

export function isPassable(tile: TileKind, byGhost: boolean): boolean {
  if (tile === "wall") return false;
  if (tile === "door") return byGhost;
  return true;
}
