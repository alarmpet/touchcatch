export type AdminPreviewDto = Readonly<{
  contentRevisionId: string;
  contentId: string;
  version: number;
  theme: string;
  language: string;
  difficulty: string;
  imageA: Readonly<{ url: string; sha256: string; width: number; height: number; mimeType: string }>;
  imageB: Readonly<{ url: string; sha256: string; width: number; height: number; mimeType: string }>;
}>;

export type AdminPublishResultDto = Readonly<{ publishId: string; contentRevisionId: string }>;
