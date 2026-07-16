interface ProcessedFile {
    originalPath: string;
    pascalCaseName: string;
    nameRaw: string;
    style: 'outlined' | 'rounded' | 'sharp';
    weight: number;
    filled: boolean;
    filename: string | null;
}
