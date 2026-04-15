import { JoinRequestCodec } from "./join-request-content.js";
import {
  ProfileSnapshotCodec,
  ProfileUpdateCodec,
} from "./profile-messages.js";

export function createConvosCodecs(): unknown[] {
  return [
    new ProfileUpdateCodec(),
    new ProfileSnapshotCodec(),
    new JoinRequestCodec(),
  ];
}
