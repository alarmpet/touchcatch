type JsonObject = Record<string, unknown>;
const object = (value:unknown):JsonObject => typeof value==='object'&&value!==null&&!Array.isArray(value) ? value as JsonObject : {};
const array = (value:unknown):unknown[] => Array.isArray(value) ? value : [];
const exactKeys=(value:unknown, allowed:readonly string[], label:string, errors:string[]) => {
  for(const key of Object.keys(object(value))) if(!allowed.includes(key)) errors.push(`${label} extra key`);
};

const COMPONENTS=['ScreenScaffold','GradientHeader','SurfaceCard','CurrencyPillGroup','PetHeroCard','ActionCard','BottomTabBar','BattleScoreHeader','WordSlots','SpotBoardPair','MissionOverlay','BattleActionDock','MeaningResultModal','PetCollectionGrid','GachaPanel','FusionGuide'];
const ORDERS:Record<string,string[]>= {
  HOME_DEFAULT:['BRAND_HEADER','PROFILE_CURRENCY','PET_HERO','PRIMARY_ACTIONS','SECONDARY_MODES','DAILY_MISSION','LEARNING_MESSAGE','BOTTOM_TABS'],
  MATCH_WORD_HUNT:['HUD','WORD_SLOTS','BOARD_PAIR','ACTION_DOCK'],
  MATCH_MEANING_SUCCESS:['MASCOT','REWARD_BANNER','COMPLETED_WORD','QUESTION','CHOICES_3','STREAK','LEARNING_BONUS'],
  PET_COLLECTION:['HEADER','PET_CURRENCY_HERO','SEGMENT_TABS','COLLECTION_GRID','GACHA','FUSION_GUIDE','BOTTOM_TABS'],
};

export function validateUiReferenceBundle(bundle:unknown):string[] {
  const errors:string[]=[]; const b=object(bundle); const theme=object(b.theme); const color=object(theme.color);
  exactKeys(color,['primary','ink','opponent','success','reward','aqua','legendary','surface','background','border','muted','overlay'],'theme.color',errors);
  const screens=object(b.screens), policy=object(screens.componentPolicy);
  if(policy.viewModelOnly!==true||policy.computesServerState!==false||policy.emitsIntentOnly!==true||policy.pendingBeforeServerConfirmation!==true) errors.push('component authority policy');
  const screenMap=object(screens.screens);
  for(const [id,order] of Object.entries(ORDERS)){
    const screen=object(screenMap[id]);
    if(JSON.stringify(screen.orderedBlockIds)!==JSON.stringify(order)) errors.push(`${id} block order`);
    for(const ids of Object.values(object(screen.blocks))) for(const component of array(ids)) if(typeof component!=='string'||!COMPONENTS.includes(component)) errors.push(`unknown component ${String(component)}`);
  }
  const refs=object(b.references); if(refs.betaReady!==false) errors.push('unapproved betaReady');
  const rights=object(b.rights); const rightsById=new Map(array(rights.records).map(r=>{const x=object(r);return [x.rightsRecordId,x.assetSha256]}));
  for(const raw of array(refs.entries)){
    const ref=object(raw), id=String(ref.id);
    if(ref.usage!=='CONCEPT_ONLY') errors.push(`reference usage ${id}`);
    if(ref.rightsStatus!=='REVIEW_REQUIRED'||ref.promptAvailable!==false||ref.promptHash!==null) errors.push(`reference approval ${id}`);
    if(rightsById.get(ref.rightsRecordId)!==ref.sha256) errors.push(`reference/rights hash link ${id}`);
  }
  return errors;
}
