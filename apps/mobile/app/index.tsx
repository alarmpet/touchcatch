import { GuestLearningScreen } from '../src/guest-content/GuestLearningScreen';
import { publicGuestSamples } from '../src/guest-content/registry';

export default function Home() {
  return <GuestLearningScreen samples={publicGuestSamples} />;
}
