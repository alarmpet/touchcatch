import { useEffect, useState } from 'react';
import { HomeScreen } from '../src/home/HomeScreen';
import { buildRuntimeHomeModel } from '../src/home/home-runtime-model';
import type { PublicHomeCollection } from '../src/home/home-model';
import { useMobileRuntime, useMobileSession } from '../src/runtime/mobile-runtime';

/** Only the fields the 도감 already shows publicly reach the home screen. */
const SHOWCASE_LIMIT = 4;

export default function Home() {
  const runtime = useMobileRuntime();
  const session = useMobileSession(runtime);
  const [collection, setCollection] = useState<PublicHomeCollection>();

  useEffect(() => {
    if (runtime.status !== 'READY' || session.status !== 'signed-in') { setCollection(undefined); return undefined; }
    let active = true;
    void runtime.pets.getCollection()
      .then((value) => {
        if (!active) return;
        setCollection({
          ownedCount: value.ownedCount,
          totalCount: value.totalCount,
          showcase: value.pets.slice(0, SHOWCASE_LIMIT).map((pet) => ({
            petId: pet.petId,
            displayKey: pet.displayKey,
            rarity: pet.rarity,
            thumbnailUrl: pet.art.thumbnailUrl,
          })),
        });
      })
      // The home screen degrades to empty slots; the pets route owns error reporting.
      .catch(() => { if (active) setCollection(undefined); });
    return () => { active = false; };
  }, [runtime, session.status]);

  const model = buildRuntimeHomeModel(runtime.status, { hasAdmittedContent: __DEV__ });
  return <HomeScreen model={collection ? { ...model, collection } : model} />;
}
