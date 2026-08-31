import { notFound } from "next/navigation";
import { RoomPage } from "@/components/room/room-page";

// The server trims room ids and rejects anything longer, so a path that could never
// name a real room is a 404 rather than a join attempt.
const MAX_ROOM_ID_LENGTH = 64;

// Next hands back the raw path segment, so decoding here is the inverse of the
// encodeURIComponent every room link is built with. A malformed escape names no room.
function readRoomId(segment: string) {
  try {
    return decodeURIComponent(segment).trim();
  } catch {
    return "";
  }
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const roomId = readRoomId(id);

  if (!roomId || roomId.length > MAX_ROOM_ID_LENGTH) {
    notFound();
  }

  return <RoomPage roomId={roomId} />;
}
