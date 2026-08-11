import { HomeScreen } from '../src/home/HomeScreen';
import { buildRuntimeHomeModel } from '../src/home/home-runtime-model';
import { useMobileRuntime } from '../src/runtime/mobile-runtime';

export default function Home() {
  const runtime = useMobileRuntime();
  return <HomeScreen model={buildRuntimeHomeModel(runtime.status)} />;
}
