import { Redirect } from 'expo-router';

/**
 * Local preview answer judging used to live here. Production play submits through
 * the authoritative session; this route must not evaluate a canonical answer.
 */
export default function AnswerRoute() {
  return <Redirect href="/game/spot-difference" />;
}
