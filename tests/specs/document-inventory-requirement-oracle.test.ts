import{expect,it}from'vitest';import{evaluateDocumentInventoryRequirement}from'../../tools/requirement-oracle.js';
it.each(['DOC-068','DOC-070','DOC-088'])('%s validates exact workspace inventory',id=>expect(evaluateDocumentInventoryRequirement(id)).toBe(true));
it('rejects unsupported document inventory',()=>expect(()=>evaluateDocumentInventoryRequirement('DOC-999')).toThrow(/unsupported/));
