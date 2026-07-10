// One-tap coordinated room looks: wall paint + flooring + a 2D plan tint.
// Applied via designStore.applyRoomStyle (single commit, fully undoable).

export interface RoomStyle {
  id: string;
  name: string;
  /** Paint applied to the room's boundary walls. */
  wallColor: string;
  /** FLOOR_MATERIALS id. */
  floorMaterial: string;
  /** 2D plan fill for the room. */
  roomFill: string;
}

export const ROOM_STYLES: RoomStyle[] = [
  { id: 'scandi', name: 'Scandi', wallColor: '#f5f4f0', floorMaterial: 'oak', roomFill: '#f6f1e5' },
  { id: 'loft', name: 'Loft', wallColor: '#cfd2d4', floorMaterial: 'concrete', roomFill: '#e8eaec' },
  { id: 'classic', name: 'Classic', wallColor: '#efe7d6', floorMaterial: 'walnut', roomFill: '#efe6d7' },
  { id: 'coastal', name: 'Coastal', wallColor: '#cfdce2', floorMaterial: 'tile_white', roomFill: '#eaf0f2' },
  { id: 'cozy', name: 'Cozy', wallColor: '#e3cdbf', floorMaterial: 'carpet_beige', roomFill: '#f0e6da' },
  { id: 'spa', name: 'Spa', wallColor: '#dfe5dc', floorMaterial: 'marble', roomFill: '#eaf0ec' },
  { id: 'blush', name: 'Blush', wallColor: '#e6c9c9', floorMaterial: 'oak', roomFill: '#f3e6e4' },
  { id: 'noir', name: 'Noir', wallColor: '#41454b', floorMaterial: 'tile_grey', roomFill: '#d9dbde' },
];

export const ROOM_STYLE_BY_ID: Record<string, RoomStyle> = Object.fromEntries(
  ROOM_STYLES.map((s) => [s.id, s]),
);
