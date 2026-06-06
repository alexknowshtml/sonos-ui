import type { Room } from "./useSonos";

export interface GroupVolumeState {
  allInOneGroup: boolean;
  sharedGroupId: string | undefined;
  groupMaxVol: number;
}

export function useGroupVolume(rooms: Room[]): GroupVolumeState {
  const groupIds = new Set(rooms.map((r) => r.groupId).filter(Boolean));
  const allInOneGroup = groupIds.size === 1 && rooms.every((r) => r.groupId);
  const sharedGroupId = allInOneGroup ? rooms[0]?.groupId : undefined;
  const groupMaxVol = allInOneGroup ? Math.max(...rooms.map((r) => r.volume ?? 0)) : 0;
  return { allInOneGroup, sharedGroupId, groupMaxVol };
}
