import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
const theme = JSON.parse(readFileSync('config/ui-theme.v1.json','utf8')) as {
  color:{primary:Record<string,string>};typography:{fontAssetId:null;fontRightsStatus:string};touchTarget:Record<string,number>;
  viewport:Record<string,unknown>;responsive:{petGrid:Array<{minWidth:number;maxWidth:number|null;columns:number[]}>};
};

it('preserves the approved nested theme token identity and accessibility limits', () => {
  expect(theme.color.primary).toEqual({ '400':'#35A8FF','600':'#0068D9','900':'#0B2F76' });
  expect(theme.typography.fontAssetId).toBeNull();
  expect(theme.typography.fontRightsStatus).toBe('REVIEW_REQUIRED');
  expect(theme.touchTarget).toEqual({ iosPt:44, androidDp:48 });
  expect(theme.viewport).toEqual({ baseline:[390,844], minimum:[320,568], additionalReview:[412,915], portraitOnlyMvp:true });
  expect(theme.responsive.petGrid.map(x => [x.minWidth,x.maxWidth,x.columns])).toEqual([[320,374,[3]],[375,599,[4]],[600,null,[5,6]]]);
});
