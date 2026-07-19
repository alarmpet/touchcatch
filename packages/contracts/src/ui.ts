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
  RESULT:['OUTCOME','SCORE_DETAIL','LEARNING_SUMMARY','PET_PROGRESS','DRAW_REWARD','RETRY_ACTION'],
};
const SEMANTICS:Record<string,Record<string,string[]>>={
  HOME_DEFAULT:{requiredContentRoles:['REPRESENTATIVE_PET','PET_LEVEL_EXP','QUICK_MATCH','FRIEND_MATCH','BOTTOM_TABS_HOME_PET_FUSION_COLLECTION'],forbiddenContentRoles:[],transitionClauses:[],accessibilityClauses:['LOGICAL_FOCUS_ORDER','SOLE_PRIMARY_ACTION_LABEL']},
  MATCH_WORD_HUNT:{requiredContentRoles:['SCORES','TIMER','FINAL_ANSWER','HINT','TARGET_SCORE_100','FOUND_DIFFERENCE_RINGS','ANSWER_CHALLENGE'],forbiddenContentRoles:['PET_STATS','FUSION_MATERIALS','PRIVATE_ANSWER'],transitionClauses:['MISSION_OVERLAY_TO_BAR_1200MS'],accessibilityClauses:['SCORE_TIMER_TABULAR_LABELS','PRIVATE_ANSWER_NON_DISCLOSURE']},
  MATCH_MEANING_SUCCESS:{requiredContentRoles:['COMPLETED_WORD','MEANING_CHOICES_3'],forbiddenContentRoles:['CORRECT_OPTION_BEFORE_SUBMIT'],transitionClauses:[],accessibilityClauses:['MODAL_FOCUS_TRAP','BLOCK_BACKDROP_AND_SYSTEM_BACK']},
  PET_COLLECTION:{requiredContentRoles:['PET_COLLECTION','DRAW_POINTS','FUSION_GUIDE'],forbiddenContentRoles:[],transitionClauses:[],accessibilityClauses:['LOCKED_PET_UNLOCK_LABEL']},
  RESULT:{requiredContentRoles:['WIN_LOSS','SCORE_DETAIL','LEARNED_WORDS','PET_EXP','DRAW_POINTS','RETRY'],forbiddenContentRoles:['PRIVATE_ANSWER'],transitionClauses:['MATCH_FINISHED_TO_RESULT'],accessibilityClauses:['RESULT_LIVE_REGION','LOGICAL_FOCUS_ORDER']},
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
    for(const[key,expected]of Object.entries(SEMANTICS[id]!))if(JSON.stringify(screen[key])!==JSON.stringify(expected))errors.push(`${id} ${key}`);
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
