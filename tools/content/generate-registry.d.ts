export type GenerateMobileRegistryOptions = Readonly<{
  manifestPath?: string;
  draftsRoot?: string;
  outputPath?: string;
}>;

export function generateMobileRegistry(
  options?: GenerateMobileRegistryOptions,
): Promise<void>;
